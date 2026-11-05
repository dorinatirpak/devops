import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Board from './Board';
import { createBoard } from '../game/logic';

describe('<Board /> (react-testing-library)', () => {
  it('renders a 15x15 grid of cells', () => {
    render(<Board board={createBoard()} onCellClick={() => {}} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(225);
  });

  it('calls onCellClick with the cell index on an empty cell', async () => {
    const onCellClick = vi.fn();
    render(<Board board={createBoard()} onCellClick={onCellClick} />);
    await userEvent.click(screen.getByTestId('cell-0-2'));
    expect(onCellClick).toHaveBeenCalledWith(2);
  });

  it('disables occupied cells and highlights the winning line', () => {
    const board = createBoard();
    board[0] = 'X';
    render(<Board board={board} onCellClick={() => {}} winningLine={[0]} />);
    const cell = screen.getByRole('gridcell', { name: 'Row 1, column 1: X' });
    expect(cell).toBeDisabled();
    expect(cell).toHaveClass('cell--X', 'cell--win');
  });
});
