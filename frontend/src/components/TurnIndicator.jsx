import { possessive } from '../game/names';

function PlayerChip({ mark, name, active, won }) {
  const cls = ['chip', `chip--${mark}`, active && 'chip--active', won && 'chip--won'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-testid={`chip-${mark}`} aria-current={active ? 'true' : undefined}>
      <span className="chip__mark" aria-hidden="true">{mark}</span>
      <span className="chip__name">{name}</span>
    </div>
  );
}

export function statusText({ players, current, result, aiThinking }) {
  if (result?.winner === 'draw') return 'Draw';
  if (result) return `${players[result.winner]} wins`;
  if (aiThinking) return `${players.O} is thinking…`;
  return `${possessive(players[current])} turn`;
}

export default function TurnIndicator(props) {
  const { players, current, result } = props;
  return (
    <div className="turn">
      <div className="turn__players">
        {['X', 'O'].map((m) => (
          <PlayerChip
            key={m}
            mark={m}
            name={players[m]}
            active={!result && current === m}
            won={result?.winner === m}
          />
        ))}
      </div>
      <p className={`status ${result ? 'status--done' : ''}`} role="status" aria-live="polite">
        {statusText(props)}
      </p>
    </div>
  );
}
