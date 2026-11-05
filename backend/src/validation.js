export const MODES = ['pvp', 'pve'];
export const RESULTS = ['X', 'O', 'draw'];
export const MAX_MOVES = 15 * 15;

const cleanName = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Validates a finished match payload coming from the client.
 * Pure function -> unit-testable without HTTP or a database.
 */
export function validateMatch(body = {}) {
  const errors = [];
  const playerX = cleanName(body.playerX);
  const playerO = cleanName(body.playerO);

  if (playerX.length < 1 || playerX.length > 32) errors.push('playerX must be 1-32 characters');
  if (playerO.length < 1 || playerO.length > 32) errors.push('playerO must be 1-32 characters');
  if (!MODES.includes(body.mode)) errors.push(`mode must be one of ${MODES.join(', ')}`);
  if (!RESULTS.includes(body.winner)) errors.push(`winner must be one of ${RESULTS.join(', ')}`);
  if (!Number.isInteger(body.moves) || body.moves < 1 || body.moves > MAX_MOVES) {
    errors.push(`moves must be an integer between 1 and ${MAX_MOVES}`);
  }

  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    value: { playerX, playerO, mode: body.mode, winner: body.winner, moves: body.moves },
  };
}
