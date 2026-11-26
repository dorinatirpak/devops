/**
 * END-TO-END TESTS – Playwright (top of the Testing Pyramid: few, slow, valuable)
 *
 * A real Chromium browser uses the real app, started with docker compose:
 * browser -> nginx (frontend container) -> Express (backend container)
 * -> PostgreSQL (db container). Nothing is faked. In CI this runs on an
 * ARM64 machine, the same CPU type as the production server.
 * Only the two most important user journeys are tested here; the details are
 * covered by the cheaper tests lower in the pyramid.
 */
import { test, expect } from '@playwright/test';

// Unique names per run so tests never depend on leftover leaderboard data.
const uid = () => Math.random().toString(36).slice(2, 8);

async function findOpponent(page, name) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Find Opponent' }).click();
}

// WHAT: two separate browser sessions (two "people") enter different names,
// press Find Opponent, get matched, and play a full game. Every move appears in
// the other browser, both see the result, and the winner shows up on the
// leaderboard and under Recent Matches.
// WHY: this is the main feature, tested through every layer of the system,
// including the WebSocket going through nginx.
test('online: two separate browsers are matched and play through the server', async ({ browser }) => {
  // Two isolated browser contexts = two different people on two devices.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const nameA = `Ada-${uid()}`;
  const nameB = `Bea-${uid()}`;

  await findOpponent(a, nameA);
  await expect(a.getByRole('status')).toHaveText(`Waiting for a challenger, ${nameA}…`);
  await findOpponent(b, nameB);

  await expect(a.getByRole('grid', { name: 'Game board' })).toBeVisible();
  await expect(b.getByRole('grid', { name: 'Game board' })).toBeVisible();

  // The server picks colours at random; work out who is X.
  // textContent, not innerText: CSS shows the tag as "YOU", the DOM text is "you".
  const aIsX = (await a.getByTestId('chip-X').textContent()).includes('you');
  const [x, o] = aIsX ? [a, b] : [b, a];
  const [xName, oName] = aIsX ? [nameA, nameB] : [nameB, nameA];

  await expect(x.getByRole('status')).toHaveText('Your turn');
  await expect(o.getByRole('status')).toHaveText(`Waiting for ${xName}`);
  await expect(o.getByTestId('cell-0-0')).toBeDisabled(); // O cannot move out of turn

  for (let c = 3; c < 7; c++) {
    await x.getByTestId(`cell-7-${c}`).click();
    await expect(o.getByTestId(`cell-7-${c}`)).toHaveText('X'); // the move reached the other browser
    await o.getByTestId(`cell-8-${c}`).click();
    await expect(x.getByTestId(`cell-8-${c}`)).toHaveText('O');
  }
  await x.getByTestId('cell-7-7').click();
  await expect(x.getByRole('status')).toHaveText('You win');
  await expect(o.getByRole('status')).toHaveText(`${xName} wins`);

  // Saved by the server: browser -> nginx -> WebSocket -> Express -> PostgreSQL -> UI.
  const row = o.getByRole('row').filter({ hasText: xName });
  await expect(row.getByRole('cell').nth(2)).toHaveText('1'); // wins column
  await o.getByRole('button', { name: 'Home' }).click();
  await expect(o.getByText(`${xName} beat ${oName}`)).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

// WHAT: a player starts a game against the Neon AI; after their move the status
// shows the AI thinking, the AI places exactly one stone, and it is the
// player's turn again.
// WHY: the second way to play, checked in the real deployed setup.
test('PvE: the AI takes a visible turn and hands it back', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill(`Cid-${uid()}`);
  await page.getByRole('button', { name: 'Play vs AI' }).click();
  await expect(page.getByTestId('chip-O')).toHaveText(/Neon AI/);

  await page.getByTestId('cell-7-7').click();
  await expect(page.getByRole('status')).toHaveText(/Neon AI is thinking/);
  await expect(page.getByRole('gridcell', { name: /: O$/ })).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('Your turn');
});
