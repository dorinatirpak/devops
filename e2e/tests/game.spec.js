import { test, expect } from '@playwright/test';

test('API health check through nginx reaches the database', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ status: 'ok', db: 'up' });
});

test('PvP: X wins with five in a row and lands on the leaderboard', async ({ page }) => {
  const player = `E2E-${Date.now()}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Neon Gothic Amőba' })).toBeVisible();

  await page.getByLabel('Player X').fill(player);

  for (let c = 3; c < 7; c++) {
    await page.getByTestId(`cell-7-${c}`).click(); // X
    await page.getByTestId(`cell-8-${c}`).click(); // O
  }
  await page.getByTestId('cell-7-7').click(); // X completes five

  await expect(page.getByRole('status')).toHaveText(`${player} (X) wins!`);

  // Full round trip: browser -> nginx -> Express -> PostgreSQL -> back to the UI.
  const row = page.getByRole('row').filter({ hasText: player });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell').nth(2)).toHaveText('1'); // wins column
});

test('PvE: the AI answers a move', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'PvE' }).click();
  await page.getByTestId('cell-7-7').click();
  await expect(page.getByRole('gridcell', { name: /: O$/ })).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('Player X (X) to move');
});
