// Mirrors backend/src/validation.js so the UI can explain problems before joining.
export const AI_NAME = 'Neon AI';
export const NAME_MAX = 20;
const RESERVED = ['player x', 'player o', 'player', 'x', 'o', 'anonymous', 'guest'];

export const cleanName = (raw = '') => raw.trim().replace(/\s+/g, ' ');

export function nameError(raw) {
  const name = cleanName(raw);
  if (!name) return 'Enter a name';
  if (name.length < 2) return 'Use at least 2 characters';
  if (name.length > NAME_MAX) return `Use at most ${NAME_MAX} characters`;
  if (RESERVED.includes(name.toLowerCase())) return 'Pick something more personal';
  if (name.toLowerCase() === AI_NAME.toLowerCase()) return 'That name belongs to the computer';
  return null;
}
