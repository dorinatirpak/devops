import { describe, it, expect } from 'vitest';
import { nameError } from './names';

describe('player names (unit)', () => {
  it('requires a personal name', () => {
    expect(nameError('')).toBe('Enter a name');
    expect(nameError(' D ')).toBe('Use at least 2 characters');
    expect(nameError('player o')).toBe('Pick something more personal');
    expect(nameError('NEON AI')).toBe('That name belongs to the computer');
    expect(nameError('  Dorina ')).toBeNull();
  });
});
