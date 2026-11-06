export const MODES = ['pvp', 'pve'];
export const RESULTS = ['X', 'O', 'draw'];
export const MAX_MOVES = 15 * 15;
export const AI_NAME = 'Neon AI';
export const NAME_MAX = 20;

// Generic placeholder names would merge different people on the leaderboard.
const RESERVED = ['player x', 'player o', 'player', 'x', 'o', 'anonymous', 'guest'];

const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const key = (name) => name.toLowerCase();

/** Returns an error message for a human player's name, or null if it is fine. */
export function nameError(name, label) {
  if (name.length < 2 || name.length > NAME_MAX) return `${label} must be 2-${NAME_MAX} characters`;
  if (RESERVED.includes(key(name))) return `${label} "${name}" is too generic`;
  if (key(name) === key(AI_NAME)) return `${label} "${AI_NAME}" is reserved for the computer`;
  return null;
}

/**
 * Validates a finished match payload. The REST endpoint only accepts `pve`
 * (pass { modes: ['pve'] }); online PvP matches are recorded by the lobby.
 * Pure function -> unit-testable without HTTP or a database.
 */
export function validateMatch(body = {}, { modes = MODES } = {}) {
  const errors = [];
  const playerX = cleanName(body.playerX);
  const pve = body.mode === 'pve';
  // In PvE the opponent is always the AI, whatever the client sent.
  const playerO = pve ? AI_NAME : cleanName(body.playerO);

  if (!modes.includes(body.mode)) errors.push(`mode must be one of ${modes.join(', ')}`);
  const xErr = nameError(playerX, 'playerX');
  if (xErr) errors.push(xErr);
  if (!pve) {
    const oErr = nameError(playerO, 'playerO');
    if (oErr) errors.push(oErr);
    if (!xErr && !oErr && key(playerX) === key(playerO)) errors.push('players must have different names');
  }
  if (!RESULTS.includes(body.winner)) errors.push(`winner must be one of ${RESULTS.join(', ')}`);
  if (!Number.isInteger(body.moves) || body.moves < 1 || body.moves > MAX_MOVES) {
    errors.push(`moves must be an integer between 1 and ${MAX_MOVES}`);
  }

  if (errors.length) return { valid: false, errors };
  return { valid: true, value: { playerX, playerO, mode: body.mode, winner: body.winner, moves: body.moves } };
}
