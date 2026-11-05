// Relative URLs: nginx (Docker) or the Vite dev proxy forwards /api to the backend.
async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${options?.method || 'GET'} ${path} failed: ${res.status}`);
  return res.json();
}

export const fetchLeaderboard = () => request('/api/leaderboard');
export const fetchHealth = () => request('/api/health');
export const saveMatch = (match) =>
  request('/api/matches', { method: 'POST', body: JSON.stringify(match) });
