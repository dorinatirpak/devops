/**
 * COMPONENT TESTS – React Testing Library (second level of the Testing Pyramid)
 *
 * The whole React app is rendered in a simulated browser (jsdom) and used the
 * way a person would: typing, clicking, reading what is on screen.
 * The backend is replaced by fakes: fetch() returns prepared answers, and
 * FakeSocket lets the test act as the matchmaking server. So these tests check
 * the UI's behaviour without needing Docker, a server or a database.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App, { AI_NAME } from './App';

// Fake backend: the component tests must not depend on a running API.
function mockFetch({ leaderboard = [], matches = [] } = {}) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url === '/api/health') return json({ status: 'ok', version: 'abcdef1234' });
    if (url === '/api/leaderboard') return json(leaderboard);
    if (url.startsWith('/api/matches') && options.method === 'POST') return json({ id: 1 }, 201);
    if (url.startsWith('/api/matches')) return json(matches);
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Fake WebSocket: the test plays the role of the matchmaking server.
class FakeSocket {
  static OPEN = 1;
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeSocket.all.push(this);
    queueMicrotask(() => {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.();
    });
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  /** Server -> browser */
  receive(msg) {
    act(() => this.onmessage?.({ data: JSON.stringify(msg) }));
  }
}
const lastSocket = () => FakeSocket.all.at(-1);

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function enterName(user, name) {
  const input = screen.getByLabelText('Your name');
  await user.clear(input);
  if (name) await user.type(input, name);
}

describe('<App /> (react-testing-library)', () => {
  // WHAT: an empty name or a generic one ("Player X") shows an error message,
  // and no connection to the matchmaking server is opened.
  // WHY: names identify players on the leaderboard; this stops anonymous or
  // merged entries already in the browser.
  it('requires a real name before matchmaking or an AI game can start', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Find Opponent' }));
    expect(screen.getByLabelText('Your name')).toHaveAccessibleDescription('Enter a name');

    await enterName(user, 'Player X');
    await user.click(screen.getByRole('button', { name: 'Play vs AI' }));
    expect(screen.getByLabelText('Your name')).toHaveAccessibleDescription('Pick something more personal');

    expect(FakeSocket.all).toHaveLength(0);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  // WHAT: the full online flow from the player's side: join the queue -> get paired
  // -> "Your turn" -> click a cell -> the stone appears only after the SERVER
  // confirms the move -> "Waiting for Bence" (board locked) -> the result is shown
  // -> the leaderboard is refreshed.
  // WHY (complex state changes): the screen must always follow the server, and the
  // browser must never save an online result itself (no POST to /api/matches).
  it('matches you with a real opponent and plays the moves the server confirms', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    render(<App />);

    await enterName(user, 'Dorina');
    await user.click(screen.getByRole('button', { name: 'Find Opponent' }));
    const ws = lastSocket();
    expect(ws.url).toMatch(/^ws:\/\/.+\/api\/ws$/);
    await waitFor(() => expect(ws.sent).toEqual([{ type: 'join', name: 'Dorina' }]));
    ws.receive({ type: 'queued', name: 'Dorina' });
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for a challenger, Dorina…');

    ws.receive({ type: 'start', gameId: 1, you: 'X', players: { X: 'Dorina', O: 'Bence' } });
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByTestId('chip-X')).toHaveTextContent(/Dorina\s*you/);

    // Clicking only asks the server; the stone appears once the server confirms it.
    await user.click(screen.getByTestId('cell-7-7'));
    expect(ws.sent.at(-1)).toEqual({ type: 'move', index: 112 });
    expect(screen.getByTestId('cell-7-7')).toHaveTextContent('');

    ws.receive({ type: 'move', index: 112, mark: 'X', next: 'O' });
    expect(screen.getByTestId('cell-7-7')).toHaveTextContent('X');
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for Bence');
    expect(screen.getByTestId('cell-0-0')).toBeDisabled(); // not your turn

    ws.receive({ type: 'move', index: 0, mark: 'O', next: 'X' });
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByTestId('cell-0-1')).toBeEnabled();

    ws.receive({ type: 'end', winner: 'O', line: [0, 1, 2, 3, 4], reason: 'five' });
    expect(screen.getByRole('status')).toHaveTextContent('Bence wins');
    expect(screen.getByTestId('cell-0-0')).toHaveClass('cell--win');

    // The server saves online games; the browser only refreshes the leaderboard.
    const lbCalls = () => fetchMock.mock.calls.filter(([u]) => u === '/api/leaderboard').length;
    const before = lbCalls();
    ws.receive({ type: 'saved' });
    await waitFor(() => expect(lbCalls()).toBeGreaterThan(before));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/matches', expect.objectContaining({ method: 'POST' }));
  });

  // WHAT: when the server answers "name taken", the player sees a clear message
  // and can go back with their name still filled in.
  // WHY: this is the UI side of the "one seat per name" security rule.
  it('explains when the name is already playing online', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);
    await enterName(user, 'Dorina');
    await user.click(screen.getByRole('button', { name: 'Find Opponent' }));
    lastSocket().receive({ type: 'error', code: 'name_taken', message: 'Dorina is already playing online' });
    expect(screen.getByRole('alert')).toHaveTextContent('Dorina is already playing online');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Dorina');
  });

  // WHAT: after your move, the status shows "Neon AI is thinking", the board is
  // locked, then the AI's stone appears (with a ring) and it is your turn again.
  // WHY: the AI answers instantly, so the app deliberately waits ~0.9 s. This test
  // guards the smooth turn hand-over that the user asked for.
  it('hands the turn to the AI visibly, then back to you', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);
    await enterName(user, 'Dorina');
    await user.click(screen.getByRole('button', { name: 'Play vs AI' }));

    expect(screen.getByTestId('chip-O')).toHaveTextContent(AI_NAME);
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');

    await user.click(screen.getByTestId('cell-7-7'));
    expect(screen.getByRole('status')).toHaveTextContent(`${AI_NAME} is thinking`);
    expect(screen.getByRole('grid')).toHaveClass('board--waiting');
    expect(screen.getByTestId('cell-0-0')).toBeDisabled();

    expect(await screen.findByRole('gridcell', { name: /: O$/ }, { timeout: 3000 })).toHaveClass('cell--last');
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByRole('grid')).not.toHaveClass('board--waiting');
  });
});
