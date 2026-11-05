import { describe, it, expect } from 'vitest';
import { validateMatch } from '../../src/validation.js';

const valid = { playerX: 'Dorina', playerO: 'Neon AI', mode: 'pve', winner: 'X', moves: 9 };

describe('validateMatch (unit)', () => {
  it('accepts a correct payload and trims names', () => {
    const r = validateMatch({ ...valid, playerX: '  Dorina  ' });
    expect(r.valid).toBe(true);
    expect(r.value.playerX).toBe('Dorina');
  });

  it('rejects an unknown mode and winner', () => {
    const r = validateMatch({ ...valid, mode: 'online', winner: 'Z' });
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(2);
  });

  it('rejects empty or too long names', () => {
    expect(validateMatch({ ...valid, playerX: '   ' }).valid).toBe(false);
    expect(validateMatch({ ...valid, playerO: 'x'.repeat(33) }).valid).toBe(false);
  });

  it('rejects impossible move counts', () => {
    expect(validateMatch({ ...valid, moves: 0 }).valid).toBe(false);
    expect(validateMatch({ ...valid, moves: 226 }).valid).toBe(false);
    expect(validateMatch({ ...valid, moves: 4.5 }).valid).toBe(false);
  });
});
