import { useEffect, useState } from 'react';
import { fetchLeaderboard } from '../api';

export default function Leaderboard({ refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((data) => !cancelled && (setRows(data), setError(null)))
      .catch(() => !cancelled && setError('Leaderboard unavailable'));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className="panel" aria-labelledby="lb-title">
      <h2 id="lb-title" className="panel__title">Leaderboard</h2>
      {error && <p role="alert" className="muted">{error}</p>}
      {!error && rows.length === 0 && <p className="muted">No matches yet. Be the first.</p>}
      {rows.length > 0 && (
        <table className="leaderboard">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">W</th>
              <th scope="col">L</th>
              <th scope="col">D</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name}>
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.draws}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
