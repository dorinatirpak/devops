// Runs once before the E2E suite: fail fast with one clear message when the
// app isn't reachable, instead of every test failing with ERR_CONNECTION_REFUSED.
export default async function globalSetup(config) {
  const baseURL = config.projects[0].use.baseURL;
  try {
    const res = await fetch(new URL('/api/health', baseURL), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    throw new Error(
      `E2E tests need the running app at ${baseURL} (${err.cause?.code || err.message}).\n` +
        'Start the whole stack first (needs Docker), from the repo root:\n' +
        '  copy .env.example .env\n' +
        '  docker compose up -d --build --wait\n' +
        'No Docker? Skip them locally: CI runs them on every push.',
    );
  }
}
