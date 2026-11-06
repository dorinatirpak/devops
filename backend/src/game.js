// Server-side copy of the board rules (frontend/src/game/logic.js).
// Online games are decided here, so a client cannot fake a win.
export const SIZE = 15;
export const WIN_LENGTH = 5;
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export const createBoard = (size = SIZE) => Array(size * size).fill(null);
export const other = (mark) => (mark === 'X' ? 'O' : 'X');

/** Returns { winner, line } or null. */
export function checkWinner(board, size = SIZE, winLength = WIN_LENGTH) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const mark = board[r * size + c];
      if (!mark) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line = [];
        for (let k = 0; k < winLength; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size || board[rr * size + cc] !== mark) break;
          line.push(rr * size + cc);
        }
        if (line.length === winLength) return { winner: mark, line };
      }
    }
  }
  return null;
}

export const isFull = (board) => board.every(Boolean);
