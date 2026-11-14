import { describe, it, expect } from 'vitest';
import { SIZE, createBoard, checkWinner, isDraw, chooseAiMove } from './logic';

const at = (r, c) => r * SIZE + c;
const place = (cells, player, board = createBoard()) => {
  cells.forEach(([r, c]) => (board[at(r, c)] = player));
  return board;
};

describe('game rules (unit)', () => {
  it('only a real line of five wins; a full board without one is a draw', () => {
    const row = place([[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]], 'X');
    expect(checkWinner(row)).toEqual({ winner: 'X', line: [at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7)] });
    expect(checkWinner(place([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]], 'O'))?.winner).toBe('O');

    // Edge cases: four is not enough, and consecutive indexes that wrap to the next row are not a line.
    expect(checkWinner(place([[0, 0], [0, 1], [0, 2], [0, 3]], 'X'))).toBeNull();
    expect(checkWinner(place([[0, 12], [0, 13], [0, 14], [1, 0], [1, 1]], 'X'))).toBeNull();

    // Full board with no run longer than 2 -> draw.
    const full = createBoard().map((_, i) => ((Math.floor((i % SIZE) / 2) + Math.floor(i / SIZE)) % 2 ? 'O' : 'X'));
    expect(isDraw(full)).toBe(true);
    expect(isDraw(row)).toBe(false);
  });

  it('the AI takes its own win first, otherwise blocks an open four', () => {
    const both = place([[3, 3], [3, 4], [3, 5], [3, 6]], 'O');
    place([[9, 3], [9, 4], [9, 5], [9, 6]], 'X', both);
    expect([at(3, 2), at(3, 7)]).toContain(chooseAiMove(both, 'O'));

    const threat = place([[5, 5], [6, 6], [7, 7], [8, 8]], 'X');
    expect([at(4, 4), at(9, 9)]).toContain(chooseAiMove(threat, 'O'));
  });
});
