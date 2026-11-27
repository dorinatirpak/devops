/**
 * ============================================================================
 *  COMPONENT TESTS – the React app                Testing Pyramid level: 2
 * ============================================================================
 *  Type:     Component test (Vitest + React Testing Library + user-event)
 *  Tests:    frontend/src/App.jsx and the screens it shows (home, matchmaking,
 *            online game, AI game). The app is rendered in a simulated browser
 *            (jsdom) and used the way a person would: typing, clicking and
 *            reading what is on the screen - not by calling functions directly.
 *  Fakes:    the whole backend:
 *              - mockFetch()  answers the REST calls (/api/health,
 *                             /api/leaderboard, /api/matches) with prepared data
 *              - FakeSocket   replaces the WebSocket; the TEST plays the role of
 *                             the matchmaking server and decides what it "says"
 *  Needs:    nothing (no Docker, no server, no database)
 *  Speed:    about a second per test
 *  Run:      cd frontend  ->  npm test
 * ============================================================================
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App, { AI_NAME } from './App';

// Fake REST backend: every fetch() call gets a prepared answer, so the tests
// never depend on a running API. Returns the mock so a test can check which
// requests the app made.
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

// Fake WebSocket: replaces the browser's WebSocket class.
//   ws.sent         everything the app sent to the "server"
//   ws.receive(msg) the test pretends the server sent this message to the app
class FakeSocket {
  static OPEN = 1;
  static all = []; // every socket the app opened, so a test can count them
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeSocket.all.push(this);
    // Like a real socket, it "connects" a moment later.
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

// Every test starts clean: no sockets, the fake WebSocket installed,
// and afterwards the fakes and any browser storage are removed.
beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// Types a name into the "Your name" field, like a user would.
async function enterName(user, name) {
  const input = screen.getByLabelText('Your name');
  await user.clear(input);
  if (name) await user.type(input, name);
}

describe('<App /> (react-testing-library)', () => {
  // --------------------------------------------------------------------------
  // TEST 1 – A real name is required (validation)
  // Checks:
  //   1. clicking "Find Opponent" with an empty name shows "Enter a name"
  //   2. a generic name ("Player X") with "Play vs AI" shows
  //      "Pick something more personal"
  //   3. in both cases NO connection to the matchmaking server is opened
  //   4. no game board appears - the player stays on the home screen
  // --------------------------------------------------------------------------
  it('requires a real name before matchmaking or an AI game can start', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);

    // 1. Empty name + "Find Opponent".
    await user.click(screen.getByRole('button', { name: 'Find Opponent' }));
    // The error is linked to the input (accessible description), so screen readers announce it too.
    expect(screen.getByLabelText('Your name')).toHaveAccessibleDescription('Enter a name');

    // 2. Generic name + "Play vs AI".
    await enterName(user, 'Player X');
    await user.click(screen.getByRole('button', { name: 'Play vs AI' }));
    expect(screen.getByLabelText('Your name')).toHaveAccessibleDescription('Pick something more personal');

    expect(FakeSocket.all).toHaveLength(0); // 3. no WebSocket was opened
    expect(screen.queryByRole('grid')).not.toBeInTheDocument(); // 4. no board
  });

  // --------------------------------------------------------------------------
  // TEST 2 – An online game, step by step (complex state changes)
  // The test acts as the server and walks through a whole online game.
  // Checks:
  //   1. "Find Opponent" opens a WebSocket to /api/ws and sends {join, name}
  //   2. "queued"  -> the screen says "Waiting for a challenger, Dorina…"
  //   3. "start"   -> the board appears, "Your turn", Dorina is marked "you"
  //   4. clicking a cell only SENDS the move; the cell stays empty until the
  //      server confirms it (the server is the referee, not the browser)
  //   5. server confirms -> the X appears, "Waiting for Bence", board locked
  //   6. opponent's move arrives -> "Your turn" again, board unlocked
  //   7. "end"     -> "Bence wins", the winning line is highlighted
  //   8. "saved"   -> the leaderboard is reloaded
  //   9. the browser NEVER posts the online result itself (security rule)
  // --------------------------------------------------------------------------
  it('matches you with a real opponent and plays the moves the server confirms', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    render(<App />);

    // 1. Join the online queue.
    await enterName(user, 'Dorina');
    await user.click(screen.getByRole('button', { name: 'Find Opponent' }));
    const ws = lastSocket();
    expect(ws.url).toMatch(/^ws:\/\/.+\/api\/ws$/); // the matchmaking endpoint
    await waitFor(() => expect(ws.sent).toEqual([{ type: 'join', name: 'Dorina' }]));
    // 2. Server: "you are in the queue".
    ws.receive({ type: 'queued', name: 'Dorina' });
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for a challenger, Dorina…');

    // 3. Server: "you were paired with Bence, you play X".
    ws.receive({ type: 'start', gameId: 1, you: 'X', players: { X: 'Dorina', O: 'Bence' } });
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByTestId('chip-X')).toHaveTextContent(/Dorina\s*you/);

    // 4. Clicking only asks the server; the stone appears once the server confirms it.
    await user.click(screen.getByTestId('cell-7-7'));
    expect(ws.sent.at(-1)).toEqual({ type: 'move', index: 112 }); // row 7, col 7 = index 112
    expect(screen.getByTestId('cell-7-7')).toHaveTextContent(''); // still empty

    // 5. Server confirms the move; now it's Bence's turn.
    ws.receive({ type: 'move', index: 112, mark: 'X', next: 'O' });
    expect(screen.getByTestId('cell-7-7')).toHaveTextContent('X');
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for Bence');
    expect(screen.getByTestId('cell-0-0')).toBeDisabled(); // not your turn

    // 6. Bence's move arrives; it's Dorina's turn again.
    ws.receive({ type: 'move', index: 0, mark: 'O', next: 'X' });
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByTestId('cell-0-1')).toBeEnabled();

    // 7. Server: the game is over, Bence won with cells 0-4.
    ws.receive({ type: 'end', winner: 'O', line: [0, 1, 2, 3, 4], reason: 'five' });
    expect(screen.getByRole('status')).toHaveTextContent('Bence wins');
    expect(screen.getByTestId('cell-0-0')).toHaveClass('cell--win'); // highlighted

    // 8. The server saves online games; the browser only refreshes the leaderboard.
    const lbCalls = () => fetchMock.mock.calls.filter(([u]) => u === '/api/leaderboard').length;
    const before = lbCalls();
    ws.receive({ type: 'saved' });
    await waitFor(() => expect(lbCalls()).toBeGreaterThan(before));
    // 9. Security rule: the browser never sends an online result to the API.
    expect(fetchMock).not.toHaveBeenCalledWith('/api/matches', expect.objectContaining({ method: 'POST' }));
  });

  // --------------------------------------------------------------------------
  // TEST 3 – "Name taken" error and name privacy
  // Checks:
  //   1. when the server refuses the name, the message is shown as an alert
  //   2. "Back" returns to the home screen with the name still filled in,
  //      so the player only has to change it (kept in memory for this visit)
  //   3. the name is NOT saved on the device, so after a reload (or for the
  //      next person on a shared computer) the field starts empty; a name left
  //      over from older versions of the app is deleted
  //   4. a fresh page load starts with an empty name field
  // --------------------------------------------------------------------------
  it('explains when the name is already playing online, without storing the name', async () => {
    mockFetch();
    localStorage.setItem('neon-requiem:name', 'Old Name'); // left over from an older version
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await enterName(user, 'Dorina');
    await user.click(screen.getByRole('button', { name: 'Find Opponent' }));
    // Server: someone called Dorina is already online.
    lastSocket().receive({ type: 'error', code: 'name_taken', message: 'Dorina is already playing online' });
    expect(screen.getByRole('alert')).toHaveTextContent('Dorina is already playing online'); // 1.

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Dorina'); // 2.

    expect(localStorage.length).toBe(0); // 3. nothing stored, the old name is gone

    unmount(); // 4. "reload": open the app again from scratch
    render(<App />);
    expect(screen.getByLabelText('Your name')).toHaveValue('');
  });

  // --------------------------------------------------------------------------
  // TEST 4 – The turn is handed to the AI visibly (state change + timing)
  // The AI computes its move instantly, so the app waits ~0.9 s on purpose to
  // make the hand-over readable instead of a flash.
  // Checks:
  //   1. the AI game starts with "Neon AI" as O and "Your turn"
  //   2. right after your move: "Neon AI is thinking", the board is dimmed
  //      (board--waiting) and you cannot click
  //   3. after the pause: exactly the AI's stone appears, marked as the last
  //      move (cell--last ring)
  //   4. then it is "Your turn" again and the board is active
  // --------------------------------------------------------------------------
  it('hands the turn to the AI visibly, then back to you', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);
    await enterName(user, 'Dorina');
    await user.click(screen.getByRole('button', { name: 'Play vs AI' }));

    // 1. Game against the AI has started.
    expect(screen.getByTestId('chip-O')).toHaveTextContent(AI_NAME);
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');

    // 2. Your move -> the AI "thinks" and the board is locked.
    await user.click(screen.getByTestId('cell-7-7'));
    expect(screen.getByRole('status')).toHaveTextContent(`${AI_NAME} is thinking`);
    expect(screen.getByRole('grid')).toHaveClass('board--waiting');
    expect(screen.getByTestId('cell-0-0')).toBeDisabled();

    // 3. Wait (up to 3 s) for the AI's O to appear; it has the "last move" ring.
    expect(await screen.findByRole('gridcell', { name: /: O$/ }, { timeout: 3000 })).toHaveClass('cell--last');
    // 4. The turn is back with you.
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByRole('grid')).not.toHaveClass('board--waiting');
  });
});
