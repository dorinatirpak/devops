import { render, screen } from '@testing-library/react';
import TurnIndicator, { statusText } from './TurnIndicator';

const players = { X: 'Dorina', O: 'Bence' };

describe('<TurnIndicator />', () => {
  it('words the status from your point of view', () => {
    expect(statusText({ players, current: 'X', you: 'X' })).toBe('Your turn');
    expect(statusText({ players, current: 'O', you: 'X' })).toBe('Waiting for Bence');
    expect(statusText({ players, current: 'O', you: 'X', thinking: true })).toBe('Bence is thinking');
    expect(statusText({ players, current: 'O', you: 'X', result: { winner: 'X' } })).toBe('You win');
    expect(statusText({ players, current: 'O', you: 'X', result: { winner: 'O' } })).toBe('Bence wins');
    expect(statusText({ players, current: 'O', you: 'O', result: { winner: 'O', reason: 'forfeit' } })).toBe(
      'You win – opponent left',
    );
    expect(statusText({ players, current: 'X', result: { winner: 'draw' } })).toBe('Draw');
  });

  it('moves one highlight to the active player instead of toggling both chips', () => {
    const { container, rerender } = render(<TurnIndicator players={players} current="X" you="X" />);
    const track = container.querySelector('.turn__players');
    expect(track).toHaveClass('turn__players--X');
    expect(screen.getByTestId('chip-X')).toHaveAttribute('aria-current', 'true');

    rerender(<TurnIndicator players={players} current="O" you="X" />);
    expect(track).toHaveClass('turn__players--O');
    expect(screen.getByTestId('chip-O')).toHaveAttribute('aria-current', 'true');

    rerender(<TurnIndicator players={players} current="O" you="X" result={{ winner: 'draw', line: [] }} />);
    expect(track).toHaveClass('turn__players--none');
  });
});
