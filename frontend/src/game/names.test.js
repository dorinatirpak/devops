import { describe, it, expect } from 'vitest';
import { nameError, validatePlayers, possessive } from './names';

describe('player names (unit)', () => {
  it('requires a personal name', () => {
    expect(nameError('')).toBe('Enter a name');
    expect(nameError(' D ')).toBe('Use at least 2 characters');
    expect(nameError('player o')).toBe('Pick something more personal');
    expect(nameError('NEON AI')).toBe('That name belongs to the computer');
    expect(nameError('  Dorina ')).toBeNull();
  });

  it('only checks Player X in PvE and requires distinct names in PvP', () => {
    expect(validatePlayers('pve', { X: 'Dorina', O: '' })).toEqual({ X: null, O: null });
    expect(validatePlayers('pvp', { X: 'Dorina', O: ' dorina' }).O).toBe('Players need different names');
  });

  it('builds a natural possessive for the turn indicator', () => {
    expect(possessive('Dorina')).toBe("Dorina's");
    expect(possessive('James')).toBe("James'");
  });
});
