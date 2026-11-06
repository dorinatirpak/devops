import { SIZE } from '../game/logic';

export default function Board({
  board,
  onCellClick,
  winningLine = [],
  lastMove = null,
  disabled = false,
  waiting = false,
  size = SIZE,
}) {
  return (
    <div
      className={`board ${waiting ? 'board--waiting' : ''}`}
      role="grid"
      aria-label="Game board"
      style={{ '--size': size }}
    >
      {board.map((value, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const classes = [
          'cell',
          value && `cell--${value}`,
          winningLine.includes(i) && 'cell--win',
          i === lastMove && !winningLine.length && 'cell--last',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            className={classes}
            data-testid={`cell-${row}-${col}`}
            aria-label={`Row ${row + 1}, column ${col + 1}${value ? `: ${value}` : ''}`}
            disabled={disabled || waiting || value !== null}
            onClick={() => onCellClick(i)}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
