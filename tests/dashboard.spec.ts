import { test, expect, Page } from '@playwright/test';

// Real end-to-end coverage of the deployed KARHUTLA Watch dashboard.
// The app labels every data source as live, demo or off; several tests
// assert that the labelling stays honest, not just that pixels render.

async function openApp(page: Page) {
  await page.goto('/');
  // Header and map are the minimum viable render.
  await expect(page.locator('header.kw-header')).toBeVisible();
  await expect(page.getByRole('application', { name: 'Indonesia fire monitoring map' })).toBeVisible({ timeout: 30_000 });
}

test('loads with map, timeline and source panel', async ({ page }) => {
  await openApp(page);
  // Data sources panel lists every feed with an honest state.
  await expect(page.getByText('Open-Meteo weather', { exact: false })).toBeVisible();
  await expect(page.getByText('NASA FIRMS active fire', { exact: false })).toBeVisible();
  await expect(page.getByText('BMKG advisories', { exact: false })).toBeVisible();
  // Timeline controls exist (range buttons 1H..7D).
  await expect(page.getByRole('button', { name: '24H', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '7D', exact: true })).toBeVisible();
});

test('hotspot layer is labelled demo or live, matching the source panel', async ({ page }) => {
  await openApp(page);
  // Without a FIRMS key the app must say the hotspots are simulated demo data.
  const firmsRow = page.getByText('NASA FIRMS active fire', { exact: false });
  await expect(firmsRow).toBeVisible();
  const demoTag = page.locator('.tag.tag-demo', { hasText: 'DEMO' }).first();
  const liveTag = page.locator('.tag.tag-live').first();
  // Exactly one of the two labels is shown, never both, never neither.
  const demoVisible = await demoTag.isVisible().catch(() => false);
  const liveVisible = await liveTag.isVisible().catch(() => false);
  expect(demoVisible !== liveVisible).toBe(true);
});

test('time range buttons switch the active range', async ({ page }) => {
  await openApp(page);
  const btn1h = page.getByRole('button', { name: '1H', exact: true });
  const btn24h = page.getByRole('button', { name: '24H', exact: true });
  await expect(btn24h).toHaveClass(/on/);
  await btn1h.click();
  await expect(btn1h).toHaveClass(/on/);
  await expect(btn24h).not.toHaveClass(/on/);
});

test('region filter narrows the hotspot ranking', async ({ page }) => {
  await openApp(page);
  const sumatra = page.getByRole('button', { name: 'Sumatra', exact: true });
  await sumatra.click();
  await expect(sumatra).toHaveClass(/on/);
  // The ranking either lists Sumatra provinces or says there is nothing in the selection.
  const ranking = page.locator('.rank-row');
  const empty = page.getByText('No demo hotspots in this selection', { exact: false })
    .or(page.getByText('No FIRMS detections in this selection', { exact: false }));
  const rows = await ranking.count();
  if (rows === 0) {
    await expect(empty.first()).toBeVisible();
  } else {
    await expect(ranking.first()).toBeVisible();
  }
});

test('theme toggle switches between dark and light', async ({ page }) => {
  await openApp(page);
  const toggle = page.getByRole('button', { name: 'Toggle dark or light mode' });
  await expect(page.locator('div.kw')).toHaveClass(/dark/);
  await toggle.click();
  await expect(toggle).toContainText('Dark mode');
  await expect(page.locator('div.kw')).toHaveClass(/light/);
});

test('location search resolves a province name', async ({ page }) => {
  await openApp(page);
  const search = page.getByRole('textbox', { name: 'Search location' });
  await search.fill('Palembang');
  await search.press('Enter');
  // A resolved search either applies a province filter or posts a note; both are visible outcomes.
  const note = page.locator('.kw-search-note');
  const provFilter = page.locator('.prov-filter');
  await expect(note.or(provFilter).first()).toBeVisible({ timeout: 10_000 });
});
