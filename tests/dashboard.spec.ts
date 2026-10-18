import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('.map')).toBeVisible();
}

test('loads with map, stats and sources panel', async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle(/KARHUTLA Watch/i);
  await expect(page.locator('.kpis .kpi').first()).toBeVisible();
  await expect(page.getByText('NASA FIRMS active fire', { exact: false })).toBeVisible();
});

test('honest labelling: hotspot panels say DEMO while FIRMS is not connected', async ({ page }) => {
  await openApp(page);
  const firmsCard = page.locator('.source-card', { hasText: 'NASA FIRMS active fire' });
  await expect(firmsCard.locator('.tag')).toHaveText('NOT CONNECTED');
  // Without a FIRMS key the app must label hotspot output as demo data.
  await expect(page.locator('.tag.tag-demo', { hasText: 'DEMO' }).first()).toBeVisible();
});

test('time range buttons switch the active range', async ({ page }) => {
  await openApp(page);
  const oneHour = page.getByRole('button', { name: '1H', exact: true });
  const oneDay = page.getByRole('button', { name: '24H', exact: true });
  await oneDay.click();
  await expect(oneDay).toHaveClass(/on/);
  await expect(oneHour).not.toHaveClass(/on/);
});

test('region filter switches between Indonesia and provinces', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Sumatra', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sumatra', exact: true })).toHaveClass(/on/);
});

test('theme toggle switches between light and dark', async ({ page }) => {
  await openApp(page);
  const app = page.locator('.kw');
  const themeBtn = page.locator('.theme-toggle');
  await expect(app).toHaveClass(/dark/);
  await themeBtn.click();
  await expect(app).not.toHaveClass(/dark/);
});

test('searching a place updates the map context', async ({ page }) => {
  await openApp(page);
  const box = page.locator('.kw-search input');
  await box.fill('Palembang');
  await box.press('Enter');
  await expect(page.locator('.kw-search-note')).toContainText('Palembang');
});
