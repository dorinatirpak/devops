import { describe, it, expect } from 'vitest';
import { SIZE, createBoard, checkWinner, isDraw, chooseAiMove } from './logic';

const at = (r, c) => r * SIZE + c;
const place = (cells, player, board = createBoard()) => {
  cells.forEach(([r, c]) => (board[at(r, c)] = player));
  return board;
};

describe('checkWinner (unit)', () => {
  it('returns null on an empty board', () => {
    expect(checkWinner(createBoard())).toBeNull();
  });

  it('detects five in a row horizontally', () => {
    const board = place([[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]], 'X');
    expect(checkWinner(board)).toEqual({
      winner: 'X',
      line: [at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7)],
    });
  });

  it('detects an anti-diagonal win', () => {
    const board = place([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]], 'O');
    expect(checkWinner(board)?.winner).toBe('O');
  });

  it('does not count four in a row or wrap around the edge', () => {
    expect(checkWinner(place([[0, 0], [0, 1], [0, 2], [0, 3]], 'X'))).toBeNull();
    // row 0 cols 12-14 + row 1 cols 0-1 are consecutive indexes but not a line
    expect(checkWinner(place([[0, 12], [0, 13], [0, 14], [1, 0], [1, 1]], 'X'))).toBeNull();
  });

  it('isDraw is true only for a full board without a winner', () => {
    expect(isDraw(createBoard())).toBe(false);
    // XXOOXXOO… shifted every row: no run longer than 2 in any direction
    const full = createBoard().map((_, i) =>
      (Math.floor((i % SIZE) / 2) + Math.floor(i / SIZE)) % 2 === 0 ? 'X' : 'O',
    );
    expect(checkWinner(full)).toBeNull();
    expect(isDraw(full)).toBe(true);
  });
});

describe('chooseAiMove (unit)', () => {
  it('opens in the centre', () => {
    expect(chooseAiMove(createBoard())).toBe(at(7, 7));
  });

  it('completes its own five instead of blocking', () => {
    const board = place([[3, 3], [3, 4], [3, 5], [3, 6]], 'O');
    place([[9, 3], [9, 4], [9, 5], [9, 6]], 'X', board);
    expect([at(3, 2), at(3, 7)]).toContain(chooseAiMove(board, 'O'));
  });

  it('blocks an open four of the human', () => {
    const board = place([[5, 5], [6, 6], [7, 7], [8, 8]], 'X');
    expect([at(4, 4), at(9, 9)]).toContain(chooseAiMove(board, 'O'));
  });
});
