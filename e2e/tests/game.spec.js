/**
 * ============================================================================
 *  END-TO-END TESTS – the whole system        Testing Pyramid level: 4 (top)
 * ============================================================================
 *  Type:     End-to-end (E2E) test (Playwright, real Chromium browser)
 *  Tests:    the complete, running application exactly as a user sees it:
 *              browser -> nginx (frontend container)
 *                      -> Express + WebSocket (backend container)
 *                      -> PostgreSQL (db container)
 *  Fakes:    nothing at all. The real Docker containers are started with
 *            docker compose; the browser clicks the real buttons.
 *  Needs:    the whole stack running (e2e/global-setup.js checks it first)
 *              - in CI: started automatically, on an ARM64 machine
 *                (the same CPU type as the production server)
 *              - locally: docker compose up -d --build --wait (repo root)
 *  Speed:    slowest level (seconds per test, minutes with Docker start-up),
 *            so only the two most important user journeys are tested here.
 *            The details are covered by the cheaper tests lower in the pyramid.
 *  Run:      cd e2e  ->  npm test
 * ============================================================================
 */
import { test, expect } from '@playwright/test';

// Unique names for every run (e.g. "Ada-k3x9qz"), so the tests never depend on
// what is already on the leaderboard and never clash with each other.
const uid = () => Math.random().toString(36).slice(2, 8);

// One player opens the home page, types a name and presses "Find Opponent".
async function findOpponent(page, name) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Find Opponent' }).click();
}

// ----------------------------------------------------------------------------
// TEST 1 – Two people play an online match
// Checks:
//   1. the first player waits ("Waiting for a challenger, …")
//   2. when the second player joins, BOTH browsers show the game board
//   3. the server chose X and O at random; the player with X has "Your turn",
//      the other sees "Waiting for …" and cannot click the board
//   4. every move appears in the OTHER browser (real-time via WebSocket)
//   5. after five in a row: "You win" for X, "<name> wins" for O
//   6. the result was saved in PostgreSQL by the server: the winner has
//      1 win on the leaderboard and appears under Recent Matches
// Why: this is the main feature, tested through every layer of the system,
// including the WebSocket connection going through nginx.
// ----------------------------------------------------------------------------
test('online: two separate browsers are matched and play through the server', async ({ browser }) => {
  // Two isolated browser contexts = two different people on two devices
  // (separate cookies and storage, like two different computers).
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const nameA = `Ada-${uid()}`;
  const nameB = `Bea-${uid()}`;

  // 1. The first player joins and waits.
  await findOpponent(a, nameA);
  await expect(a.getByRole('status')).toHaveText(`Waiting for a challenger, ${nameA}…`);
  // 2. The second player joins -> they are matched.
  await findOpponent(b, nameB);

  await expect(a.getByRole('grid', { name: 'Game board' })).toBeVisible();
  await expect(b.getByRole('grid', { name: 'Game board' })).toBeVisible();

  // 3. The server picks colours at random; work out who is X.
  // textContent, not innerText: CSS shows the tag as "YOU", the DOM text is "you".
  const aIsX = (await a.getByTestId('chip-X').textContent()).includes('you');
  const [x, o] = aIsX ? [a, b] : [b, a];
  const [xName, oName] = aIsX ? [nameA, nameB] : [nameB, nameA];

  await expect(x.getByRole('status')).toHaveText('Your turn');
  await expect(o.getByRole('status')).toHaveText(`Waiting for ${xName}`);
  await expect(o.getByTestId('cell-0-0')).toBeDisabled(); // O cannot move out of turn

  // 4. Four rounds: X on row 7, O on row 8 (columns 3-6).
  for (let c = 3; c < 7; c++) {
    await x.getByTestId(`cell-7-${c}`).click();
    await expect(o.getByTestId(`cell-7-${c}`)).toHaveText('X'); // the move reached the other browser
    await o.getByTestId(`cell-8-${c}`).click();
    await expect(x.getByTestId(`cell-8-${c}`)).toHaveText('O'); // and back again
  }
  // 5. X's fifth stone (row 7, column 7) wins the game.
  await x.getByTestId('cell-7-7').click();
  await expect(x.getByRole('status')).toHaveText('You win');
  await expect(o.getByRole('status')).toHaveText(`${xName} wins`);

  // 6. Saved by the server: browser -> nginx -> WebSocket -> Express -> PostgreSQL -> UI.
  const row = o.getByRole('row').filter({ hasText: xName }); // the winner's leaderboard row
  await expect(row.getByRole('cell').nth(2)).toHaveText('1'); // wins column
  await o.getByRole('button', { name: 'Home' }).click();
  await expect(o.getByText(`${xName} beat ${oName}`)).toBeVisible(); // Recent Matches

  await ctxA.close();
  await ctxB.close();
});

// ----------------------------------------------------------------------------
// TEST 2 – A game against the Neon AI
// Checks:
//   1. the AI game starts, with "Neon AI" as the opponent (O)
//   2. after the player's move the status shows "Neon AI is thinking"
//   3. the AI places exactly ONE stone (one O on the board)
//   4. then it is the player's turn again
// Why: the second way to play, checked in the real deployed setup.
// ----------------------------------------------------------------------------
test('PvE: the AI takes a visible turn and hands it back', async ({ page }) => {
  // 1. Start a game against the AI.
  await page.goto('/');
  await page.getByLabel('Your name').fill(`Cid-${uid()}`);
  await page.getByRole('button', { name: 'Play vs AI' }).click();
  await expect(page.getByTestId('chip-O')).toHaveText(/Neon AI/);

  // 2. The player places X in the centre; the AI starts "thinking".
  await page.getByTestId('cell-7-7').click();
  await expect(page.getByRole('status')).toHaveText(/Neon AI is thinking/);
  // 3. Exactly one O appears (Playwright waits for it automatically).
  await expect(page.getByRole('gridcell', { name: /: O$/ })).toHaveCount(1);
  // 4. The turn is back with the player.
  await expect(page.getByRole('status')).toHaveText('Your turn');
});
