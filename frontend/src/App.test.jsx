import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App, { AI_NAME } from './App';

// Fake backend: the component test must not depend on a running API.
function mockFetch() {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url === '/api/health') return json({ status: 'ok', version: 'abcdef1234' });
    if (url === '/api/leaderboard') return json([]);
    if (url === '/api/matches' && options.method === 'POST') return json({ id: 1 }, 201);
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('<App /> (react-testing-library)', () => {
  it('alternates turns and announces the winner in PvP', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Player X'));
    await user.type(screen.getByLabelText('Player X'), 'Dorina');
    expect(screen.getByRole('status')).toHaveTextContent('Dorina (X) to move');

    // X: row 1 cols 1-5, O: row 2 cols 1-4
    for (let c = 0; c < 4; c++) {
      await user.click(screen.getByTestId(`cell-0-${c}`));
      await user.click(screen.getByTestId(`cell-1-${c}`));
    }
    await user.click(screen.getByTestId('cell-0-4'));

    expect(screen.getByRole('status')).toHaveTextContent('Dorina (X) wins!');
    expect(screen.getByTestId('cell-5-5')).toBeDisabled();

    // The finished match is sent to the backend.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/matches',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const [, { body }] = fetchMock.mock.calls.find(([u, o]) => u === '/api/matches' && o?.method === 'POST');
    expect(JSON.parse(body)).toEqual({ playerX: 'Dorina', playerO: 'Player O', mode: 'pvp', winner: 'X', moves: 9 });
  });

  it('lets the AI answer in PvE mode', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'PvE' }));
    expect(screen.getByLabelText('Player O')).toHaveValue(AI_NAME);

    await user.click(screen.getByTestId('cell-7-7'));
    // After its "thinking" delay the AI places an O somewhere on the board.
    expect(await screen.findByRole('gridcell', { name: /: O$/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Player X (X) to move');
  });

  it('shows the deployed build version from /api/health', async () => {
    mockFetch();
    render(<App />);
    expect(await screen.findByText('build abcdef1')).toBeInTheDocument();
  });
});
