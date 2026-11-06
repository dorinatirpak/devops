function PlayerChip({ mark, name, active, won, isYou }) {
  const cls = ['chip', `chip--${mark}`, active && 'chip--active', won && 'chip--won'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-testid={`chip-${mark}`} aria-current={active ? 'true' : undefined}>
      <span className="chip__mark" aria-hidden="true">{mark}</span>
      <span className="chip__name">{name}</span>
      {isYou && <span className="chip__tag">you</span>}
    </div>
  );
}

/**
 * Status line for a match.
 *   you       which mark this browser controls ('X' in AI games)
 *   thinking  the AI has "picked up" its turn
 */
export function statusText({ players, current, result, you, thinking }) {
  if (result?.winner === 'draw') return 'Draw';
  if (result) {
    const who = result.winner === you ? 'You win' : `${players[result.winner]} wins`;
    return result.reason === 'forfeit' ? `${who} – opponent left` : who;
  }
  if (thinking) return `${players[current]} is thinking`;
  return current === you ? 'Your turn' : `Waiting for ${players[current]}`;
}

/**
 * A highlight bar glides between the two players instead of switching instantly,
 * and the status line cross-fades, so even a fast opponent reads as a calm hand-over.
 */
export default function TurnIndicator(props) {
  const { players, current, result, you, thinking } = props;
  const focus = result ? (result.winner === 'draw' ? null : result.winner) : current;
  const text = statusText(props);

  return (
    <div className="turn">
      <div
        className={`turn__players turn__players--${focus ?? 'none'} ${result ? 'turn__players--done' : ''}`}
      >
        <span className="turn__glider" aria-hidden="true" />
        {['X', 'O'].map((m) => (
          <PlayerChip
            key={m}
            mark={m}
            name={players[m]}
            active={!result && current === m}
            won={result?.winner === m}
            isYou={m === you}
          />
        ))}
      </div>
      <p className={`status ${result ? 'status--done' : ''}`} role="status" aria-live="polite">
        <span key={text} className="status__text">
          {text}
          {thinking && <span className="dots" aria-hidden="true" />}
        </span>
      </p>
    </div>
  );
}
