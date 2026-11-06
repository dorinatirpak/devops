import { describe, it, expect } from 'vitest';
import { validateMatch } from '../../src/validation.js';

const pvp = { playerX: 'Dorina', playerO: 'Bence', mode: 'pvp', winner: 'X', moves: 9 };
const pve = { playerX: 'Dorina', playerO: 'Neon AI', mode: 'pve', winner: 'O', moves: 12 };

describe('validateMatch (unit)', () => {
  it('accepts a correct PvP payload and normalises whitespace in names', () => {
    const r = validateMatch({ ...pvp, playerX: '  Dorina   T  ' });
    expect(r.valid).toBe(true);
    expect(r.value.playerX).toBe('Dorina T');
  });

  it('always records the AI as the PvE opponent', () => {
    const r = validateMatch({ ...pve, playerO: 'Someone else' });
    expect(r.valid).toBe(true);
    expect(r.value.playerO).toBe('Neon AI');
  });

  it('rejects an unknown mode and winner', () => {
    const r = validateMatch({ ...pvp, mode: 'online', winner: 'Z' });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/^mode/), expect.stringMatching(/^winner/)]),
    );
  });

  it('rejects missing, too short and too long names', () => {
    expect(validateMatch({ ...pvp, playerX: '   ' }).valid).toBe(false);
    expect(validateMatch({ ...pvp, playerX: 'D' }).valid).toBe(false);
    expect(validateMatch({ ...pvp, playerO: 'x'.repeat(21) }).valid).toBe(false);
  });

  it('rejects generic placeholder names that would merge leaderboard rows', () => {
    expect(validateMatch({ ...pvp, playerX: 'Player X' }).valid).toBe(false);
    expect(validateMatch({ ...pvp, playerO: 'guest' }).valid).toBe(false);
  });

  it('rejects the reserved AI name for humans and identical PvP names', () => {
    expect(validateMatch({ ...pve, playerX: 'neon ai' }).valid).toBe(false);
    expect(validateMatch({ ...pvp, playerO: 'DORINA' }).errors).toContain('players must have different names');
  });

  it('rejects impossible move counts', () => {
    expect(validateMatch({ ...pvp, moves: 0 }).valid).toBe(false);
    expect(validateMatch({ ...pvp, moves: 226 }).valid).toBe(false);
    expect(validateMatch({ ...pvp, moves: 4.5 }).valid).toBe(false);
  });
});
