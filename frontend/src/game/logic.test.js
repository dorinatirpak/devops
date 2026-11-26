/**
 * UNIT TESTS – game rules (bottom of the Testing Pyramid)
 *
 * Pure functions, no browser, no server, no database: they run in milliseconds.
 * The same win-detection rules also run on the server (backend/src/game.js),
 * so if these are wrong, every game in the app is wrong.
 */
import { describe, it, expect } from 'vitest';
import { SIZE, createBoard, checkWinner, isDraw, chooseAiMove } from './logic';

const at = (r, c) => r * SIZE + c;
const place = (cells, player, board = createBoard()) => {
  cells.forEach(([r, c]) => (board[at(r, c)] = player));
  return board;
};

describe('game rules (unit)', () => {
  // WHAT: checkWinner() finds 5 in a row (horizontal and diagonal), and isDraw()
  // only reports a draw for a full board with no winner.
  // EDGE CASES: 4 in a row is NOT a win, and cells that are next to each other in
  // the array but wrap onto the next row of the board do NOT form a line.
  // WHY: this is the core rule of the game. A bug here means wrong winners.
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

  // WHAT: the Neon AI (chooseAiMove) completes its own five when it can, and
  // otherwise blocks the human's open four.
  // WHY: the order matters: winning beats defending. Without this the AI would be
  // trivially easy to beat, or miss a guaranteed win.
  it('the AI takes its own win first, otherwise blocks an open four', () => {
    const both = place([[3, 3], [3, 4], [3, 5], [3, 6]], 'O');
    place([[9, 3], [9, 4], [9, 5], [9, 6]], 'X', both);
    expect([at(3, 2), at(3, 7)]).toContain(chooseAiMove(both, 'O'));

    const threat = place([[5, 5], [6, 6], [7, 7], [8, 8]], 'X');
    expect([at(4, 4), at(9, 9)]).toContain(chooseAiMove(threat, 'O'));
  });
});
