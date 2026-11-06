import { test, expect } from '@playwright/test';

// Unique names per run so tests never depend on leftover leaderboard data.
const uid = () => Math.random().toString(36).slice(2, 8);

async function findOpponent(page, name) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Find Opponent' }).click();
}

test('API health check through nginx reaches the database', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ status: 'ok', db: 'up' });
});

test('home screen asks for one name and offers online play or the AI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Neon Requiem' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Find Opponent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play vs AI' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Matches' })).toBeVisible();
});

test('nobody can start without a real name', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Find Opponent' }).click();
  await expect(page.getByText('Enter a name')).toBeVisible();
  await page.getByLabel('Your name').fill('Player X');
  await page.getByRole('button', { name: 'Play vs AI' }).click();
  await expect(page.getByText('Pick something more personal')).toBeVisible();
  await expect(page.getByRole('grid')).toHaveCount(0);
});

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
  const aIsX = /you/.test(await a.getByTestId('chip-X').innerText());
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

test('online: the same name cannot join twice, so you cannot play yourself', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const name = `Eve-${uid()}`;

  await findOpponent(a, name);
  await expect(a.getByRole('status')).toHaveText(`Waiting for a challenger, ${name}…`);
  await findOpponent(b, name.toUpperCase());
  await expect(b.getByRole('alert')).toHaveText(`${name.toUpperCase()} is already playing online`);
  await expect(a.getByRole('grid')).toHaveCount(0);

  await a.getByRole('button', { name: 'Cancel' }).click();
  await ctxA.close();
  await ctxB.close();
});

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
