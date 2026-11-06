import { useEffect, useState } from 'react';
import { fetchRecentMatches } from '../api';

function describe(m) {
  if (m.winner === 'draw') return `${m.playerX} and ${m.playerO} drew`;
  const [winner, loser] = m.winner === 'X' ? [m.playerX, m.playerO] : [m.playerO, m.playerX];
  return `${winner} beat ${loser}`;
}

export default function RecentMatches({ refreshKey = 0 }) {
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRecentMatches()
      .then((data) => !cancelled && (setMatches(data), setError(false)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className="panel" aria-labelledby="recent-title">
      <h2 id="recent-title" className="panel__title">Recent Matches</h2>
      {error && <p className="muted">Match history unavailable</p>}
      {!error && matches.length === 0 && <p className="muted">No matches played yet.</p>}
      {matches.length > 0 && (
        <ul className="recent">
          {matches.map((m) => (
            <li key={m.id}>
              <span>{describe(m)}</span>
              <span className="muted">
                {m.mode === 'pve' ? 'vs AI' : 'Online'} · {m.moves} moves
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
