/**
 * ============================================================================
 *  UNIT TESTS – game rules                      Testing Pyramid level: 1 (base)
 * ============================================================================
 *  Type:     Unit test (Vitest)
 *  Tests:    frontend/src/game/logic.js – the pure game functions
 *              checkWinner()   is there five in a row on the board?
 *              isDraw()        is the board full without a winner?
 *              chooseAiMove()  where does the Neon AI play?
 *  Fakes:    none – plain functions in, plain values out
 *  Needs:    nothing (no browser, no server, no database)
 *  Speed:    milliseconds
 *  Run:      cd frontend  ->  npm test
 *
 *  Why it matters: these are the rules of the game. The server uses the same
 *  rules (backend/src/game.js), so a bug here would mean wrong winners
 *  everywhere in the app.
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { SIZE, createBoard, checkWinner, isDraw, chooseAiMove } from './logic';

// Helpers to build test boards quickly.
// The board is a flat array of 15 x 15 = 225 cells; at(row, col) turns a
// (row, column) position into the array index.
const at = (r, c) => r * SIZE + c;
// place() puts the given player's mark ('X' or 'O') on a list of [row, col] cells.
const place = (cells, player, board = createBoard()) => {
  cells.forEach(([r, c]) => (board[at(r, c)] = player));
  return board;
};

describe('game rules (unit)', () => {
  // --------------------------------------------------------------------------
  // TEST 1 – Win and draw detection
  // Checks:
  //   1. five X in a horizontal row  -> X wins, and the 5 winning cells are returned
  //   2. five O on a diagonal        -> O wins
  //   3. only four in a row          -> nobody wins (edge case)
  //   4. five cells that are next to each other in the array but continue on
  //      the NEXT row of the board    -> NOT a line, nobody wins (edge case)
  //   5. a full board without five   -> draw
  //   6. a board that has a winner   -> not a draw
  // --------------------------------------------------------------------------
  it('only a real line of five wins; a full board without one is a draw', () => {
    // 1. Horizontal five: row 7, columns 3-7.
    const row = place([[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]], 'X');
    // The result must name the winner AND list the winning cells (the UI highlights them).
    expect(checkWinner(row)).toEqual({ winner: 'X', line: [at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7)] });
    // 2. Anti-diagonal five (top-right to bottom-left) for O.
    expect(checkWinner(place([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]], 'O'))?.winner).toBe('O');

    // 3. Edge case: four in a row is not enough.
    expect(checkWinner(place([[0, 0], [0, 1], [0, 2], [0, 3]], 'X'))).toBeNull();
    // 4. Edge case: end of row 0 (cols 12-14) + start of row 1 (cols 0-1).
    //    In the array these are 5 consecutive indexes, but on the board they are
    //    not a line. A naive implementation would wrongly call this a win.
    expect(checkWinner(place([[0, 12], [0, 13], [0, 14], [1, 0], [1, 1]], 'X'))).toBeNull();

    // 5. A completely full board built in a pattern that never has more than
    //    2 of the same mark in a row in any direction -> must be a draw.
    const full = createBoard().map((_, i) => ((Math.floor((i % SIZE) / 2) + Math.floor(i / SIZE)) % 2 ? 'O' : 'X'));
    expect(isDraw(full)).toBe(true);
    // 6. A board with a winner (and empty cells) is not a draw.
    expect(isDraw(row)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // TEST 2 – The AI's priorities
  // Checks:
  //   1. when the AI (O) has four in a row AND the human (X) also has four,
  //      the AI completes its OWN five (winning beats blocking)
  //   2. when only the human threatens five, the AI blocks one of the two ends
  // --------------------------------------------------------------------------
  it('the AI takes its own win first, otherwise blocks an open four', () => {
    // 1. O has four on row 3, X has four on row 9.
    const both = place([[3, 3], [3, 4], [3, 5], [3, 6]], 'O');
    place([[9, 3], [9, 4], [9, 5], [9, 6]], 'X', both);
    // The AI must play at either end of its own line (row 3, col 2 or col 7) and win.
    expect([at(3, 2), at(3, 7)]).toContain(chooseAiMove(both, 'O'));

    // 2. X has an open diagonal four (5,5)-(8,8); O has nothing.
    const threat = place([[5, 5], [6, 6], [7, 7], [8, 8]], 'X');
    // The AI must block one end of the diagonal: (4,4) or (9,9).
    expect([at(4, 4), at(9, 9)]).toContain(chooseAiMove(threat, 'O'));
  });
});
