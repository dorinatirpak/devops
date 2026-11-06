import { test, expect } from '@playwright/test';

// Unique names per run so tests never depend on leftover leaderboard data.
const uid = () => Math.random().toString(36).slice(2, 8);

async function startGame(page, { mode = 'pvp', x, o }) {
  await page.getByRole('button', { name: 'New Game' }).click();
  if (mode === 'pve') await page.getByText('Player vs AI').click();
  await page.getByLabel('Player X').fill(x);
  if (mode === 'pvp') await page.getByLabel('Player O').fill(o);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('grid', { name: 'Game board' })).toBeVisible();
}

test('API health check through nginx reaches the database', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ status: 'ok', db: 'up' });
});

test('home screen shows the title, New Game, leaderboard and recent matches', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Neon Requiem' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Matches' })).toBeVisible();
});

test('a game cannot start without real player names', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Enter a name').first()).toBeVisible();

  await page.getByLabel('Player X').fill('Player X');
  await page.getByLabel('Player O').fill('Player O');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Pick something more personal').first()).toBeVisible();
  await expect(page.getByRole('grid')).toHaveCount(0);
});

test('PvP: X wins with five in a row and lands on the leaderboard', async ({ page }) => {
  const x = `Ada-${uid()}`;
  const o = `Bea-${uid()}`;
  await page.goto('/');
  await startGame(page, { x, o });
  await expect(page.getByRole('status')).toHaveText(`${x}'s turn`);

  for (let c = 3; c < 7; c++) {
    await page.getByTestId(`cell-7-${c}`).click(); // X
    await expect(page.getByRole('status')).toHaveText(`${o}'s turn`);
    await page.getByTestId(`cell-8-${c}`).click(); // O
  }
  await page.getByTestId('cell-7-7').click(); // X completes five
  await expect(page.getByRole('status')).toHaveText(`${x} wins`);

  // Full round trip: browser -> nginx -> Express -> PostgreSQL -> back to the UI.
  const row = page.getByRole('row').filter({ hasText: x });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell').nth(2)).toHaveText('1'); // wins column

  // ...and the home screen lists it under recent matches.
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText(`${x} beat ${o}`)).toBeVisible();
});

test('PvE: the AI answers a move', async ({ page }) => {
  const x = `Cid-${uid()}`;
  await page.goto('/');
  await startGame(page, { mode: 'pve', x });
  await expect(page.getByTestId('chip-O')).toHaveText(/Neon AI/);
  await page.getByTestId('cell-7-7').click();
  await expect(page.getByRole('gridcell', { name: /: O$/ })).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText(`${x}'s turn`);
});
