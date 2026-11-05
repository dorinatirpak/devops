import { SIZE } from '../game/logic';

export default function Board({ board, onCellClick, winningLine = [], disabled = false, size = SIZE }) {
  return (
    <div
      className="board"
      role="grid"
      aria-label="Amőba board"
      style={{ '--size': size }}
    >
      {board.map((value, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const classes = ['cell', value && `cell--${value}`, winningLine.includes(i) && 'cell--win']
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
            disabled={disabled || value !== null}
            onClick={() => onCellClick(i)}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
