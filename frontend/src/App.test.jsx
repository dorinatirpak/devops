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

/** Home -> Find Opponent -> paired by the fake server. */
async function startOnline(user, { you = 'X', me = 'Dorina', rival = 'Bence' } = {}) {
  await enterName(user, me);
  await user.click(screen.getByRole('button', { name: 'Find Opponent' }));
  const ws = lastSocket();
  await waitFor(() => expect(ws.sent).toContainEqual({ type: 'join', name: me }));
  ws.receive({ type: 'queued', name: me });
  const players = you === 'X' ? { X: me, O: rival } : { X: rival, O: me };
  ws.receive({ type: 'start', gameId: 1, you, players });
  return ws;
}

describe('<App /> (react-testing-library)', () => {
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

  it('announces a forfeit and can search for a new opponent', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);
    const ws = await startOnline(user, { you: 'O' });
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for Bence');

    ws.receive({ type: 'end', winner: 'O', line: [], reason: 'forfeit' });
    expect(screen.getByRole('status')).toHaveTextContent('You win – opponent left');

    await user.click(screen.getByRole('button', { name: 'New opponent' }));
    expect(FakeSocket.all).toHaveLength(2);
    await waitFor(() => expect(lastSocket().sent).toEqual([{ type: 'join', name: 'Dorina' }]));
  });

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
