// Pure game logic (no React) -> easy to unit test.
export const SIZE = 15;
export const WIN_LENGTH = 5;
const DIRECTIONS = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↙
];

export const createBoard = (size = SIZE) => Array(size * size).fill(null);
export const other = (player) => (player === 'X' ? 'O' : 'X');

/** Returns { winner, line } where line is the list of winning cell indexes, or null. */
export function checkWinner(board, size = SIZE, winLength = WIN_LENGTH) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const player = board[r * size + c];
      if (!player) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line = [];
        for (let k = 0; k < winLength; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
          if (board[rr * size + cc] !== player) break;
          line.push(rr * size + cc);
        }
        if (line.length === winLength) return { winner: player, line };
      }
    }
  }
  return null;
}

export const isDraw = (board) => board.every(Boolean) && !checkWinner(board);

// Score of a run of `count` stones with `openEnds` free ends.
function runScore(count, openEnds) {
  if (count >= WIN_LENGTH) return 1_000_000;
  if (openEnds === 0) return 0;
  const table = { 4: [5_000, 50_000], 3: [500, 5_000], 2: [50, 300], 1: [5, 20] };
  return table[count][openEnds - 1];
}

// How good is it for `player` to place a stone at (r, c)?
function scoreCell(board, size, r, c, player) {
  let total = 0;
  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    let openEnds = 0;
    for (const sign of [1, -1]) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;
      while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === player) {
        count++;
        rr += dr * sign;
        cc += dc * sign;
      }
      if (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === null) openEnds++;
    }
    total += runScore(count, openEnds);
  }
  return total;
}

/** Heuristic PvE opponent: win if possible, otherwise block, otherwise build. */
export function chooseAiMove(board, ai = 'O', size = SIZE) {
  const human = other(ai);
  const center = Math.floor(size / 2);
  if (board.every((v) => v === null)) return center * size + center;

  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    const attack = scoreCell(board, size, r, c, ai);
    const defend = scoreCell(board, size, r, c, human);
    // Slight preference for the centre breaks ties deterministically.
    const score = attack * 1.1 + defend - (Math.abs(r - center) + Math.abs(c - center)) * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
