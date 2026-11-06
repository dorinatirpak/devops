import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App, { APP_NAME, AI_NAME } from './App';

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

afterEach(() => vi.unstubAllGlobals());

async function startGame(user, { mode = 'pvp', x = 'Dorina', o = 'Bence' } = {}) {
  await user.click(screen.getByRole('button', { name: 'New Game' }));
  if (mode === 'pve') await user.click(screen.getByRole('radio', { name: /Player vs AI/ }));
  if (x) await user.type(screen.getByLabelText('Player X'), x);
  if (o && mode === 'pvp') await user.type(screen.getByLabelText('Player O'), o);
  await user.click(screen.getByRole('button', { name: 'Start' }));
}

describe('<App /> (react-testing-library)', () => {
  it('opens on the home screen with title, New Game, leaderboard and recent matches', async () => {
    mockFetch({
      leaderboard: [{ name: 'Dorina', wins: 3, losses: 1, draws: 0, games: 4 }],
      matches: [{ id: 7, playerX: 'Dorina', playerO: 'Bence', mode: 'pvp', winner: 'X', moves: 17 }],
    });
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    const leaderboard = screen.getByRole('region', { name: 'Leaderboard' });
    expect(await within(leaderboard).findByRole('cell', { name: 'Dorina' })).toBeInTheDocument();
    expect(await screen.findByText('Dorina beat Bence')).toBeInTheDocument();
  });

  it('requires real, distinct player names before a game can start', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);

    await startGame(user, { x: '', o: '' });
    expect(screen.getByLabelText('Player X')).toHaveAccessibleDescription('Enter a name');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Player X'), 'Player X');
    await user.type(screen.getByLabelText('Player O'), 'Dorina');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByLabelText('Player X')).toHaveAccessibleDescription('Pick something more personal');

    await user.clear(screen.getByLabelText('Player X'));
    await user.type(screen.getByLabelText('Player X'), 'dorina');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByLabelText('Player O')).toHaveAccessibleDescription('Players need different names');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('shows whose turn it is and announces the winner in PvP', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    render(<App />);
    await startGame(user);

    expect(screen.getByRole('status')).toHaveTextContent("Dorina's turn");
    // X: row 1 cols 1-5, O: row 2 cols 1-4
    for (let c = 0; c < 4; c++) {
      await user.click(screen.getByTestId(`cell-0-${c}`));
      if (c === 0) expect(screen.getByRole('status')).toHaveTextContent("Bence's turn");
      await user.click(screen.getByTestId(`cell-1-${c}`));
    }
    await user.click(screen.getByTestId('cell-0-4'));

    expect(screen.getByRole('status')).toHaveTextContent('Dorina wins');
    expect(screen.getByTestId('cell-5-5')).toBeDisabled();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/matches', expect.objectContaining({ method: 'POST' })),
    );
    const [, { body }] = fetchMock.mock.calls.find(([u, o]) => u === '/api/matches' && o?.method === 'POST');
    expect(JSON.parse(body)).toEqual({ playerX: 'Dorina', playerO: 'Bence', mode: 'pvp', winner: 'X', moves: 9 });

    // Rematch keeps the players and clears the board.
    await user.click(screen.getByRole('button', { name: 'Rematch' }));
    expect(screen.getByRole('status')).toHaveTextContent("Dorina's turn");
    expect(screen.getByTestId('cell-0-0')).toBeEnabled();
  });

  it('lets the AI answer in PvE mode', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);
    await startGame(user, { mode: 'pve' });

    expect(screen.getByTestId('chip-O')).toHaveTextContent(AI_NAME);
    await user.click(screen.getByTestId('cell-7-7'));
    expect(await screen.findByRole('gridcell', { name: /: O$/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent("Dorina's turn");
  });

  it('returns home and shows the deployed build version', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('build abcdef1')).toBeInTheDocument();

    await startGame(user);
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument();
  });
});
