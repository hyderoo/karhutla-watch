import { test, expect, Page } from '@playwright/test';

// Map behaviour: hotspot drawer, zoom controls, drag pan, layer toggles,
// province click-to-zoom. Runs against the deployed app (demo hotspot data
// is deterministic) or a local build via E2E_BASE_URL.

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('.map')).toBeVisible();
  await expect(page.locator('circle.hotspot').first()).toBeVisible({ timeout: 30_000 });
}

async function viewBox(page: Page): Promise<string> {
  return page.locator('svg.map').getAttribute('viewBox') as Promise<string>;
}

test('clicking a hotspot opens its drawer with an honest SIMULATED tag', async ({ page }) => {
  await openApp(page);
  // Pick a hotspot inside the current viewBox so a real click can reach it.
  const idx = await page.evaluate(() => {
    const svg = document.querySelector('svg.map')!;
    const [vx, vy, vw, vh] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const dots = [...document.querySelectorAll<SVGCircleElement>('circle.hotspot')];
    return dots.findIndex((c) => {
      const cx = Number(c.getAttribute('cx')), cy = Number(c.getAttribute('cy'));
      return cx > vx && cx < vx + vw && cy > vy && cy < vy + vh;
    });
  });
  expect(idx).toBeGreaterThanOrEqual(0);
  await page.locator('circle.hotspot').nth(idx).click({ force: true });
  const drawer = page.locator('aside.drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('h3')).toContainText('Hotspot #');
  // Without a FIRMS key the drawer must label the row as simulated, not live.
  await expect(drawer.locator('.tag.tag-demo')).toHaveText('SIMULATED');
  await expect(drawer).toContainText('Coordinates');
  await expect(drawer).toContainText('(simulated)');
  await drawer.getByRole('button', { name: 'Close' }).click();
  await expect(drawer).not.toBeVisible();
});

test('zoom controls change the view and reset restores it', async ({ page }) => {
  await openApp(page);
  const full = await viewBox(page);
  // The map clamps zoom at a viewport-dependent minimum, so click until the view moves.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  const zoomed = await viewBox(page);
  expect(zoomed).not.toBe(full);
  // Zoomed in: the visible width shrinks.
  expect(Number(zoomed.split(' ')[2])).toBeLessThan(Number(full.split(' ')[2]));
  await page.getByRole('button', { name: 'Reset view' }).click();
  expect(await viewBox(page)).toBe(full);
});

test('dragging pans the map', async ({ page }) => {
  await openApp(page);
  const before = await viewBox(page);
  const map = page.locator('svg.map');
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  expect(await viewBox(page)).not.toBe(before);
  // A drag must not open the hotspot drawer.
  await expect(page.locator('aside.drawer')).toHaveCount(0);
});

test('layer toggles remove and restore map layers', async ({ page }) => {
  await openApp(page);
  const heat = page.locator('svg.map circle[fill="url(#heat)"]');
  await expect(heat.first()).toBeVisible();
  const heatCount = await heat.count();
  expect(heatCount).toBeGreaterThan(0);
  const toggle = page.locator('.layer-toggles button', { hasText: 'Heatmap' });
  await toggle.click();
  await expect(toggle).not.toHaveClass(/on/);
  await expect(page.locator('svg.map circle[fill="url(#heat)"]')).toHaveCount(0);
  await toggle.click();
  await expect(page.locator('svg.map circle[fill="url(#heat)"]')).toHaveCount(heatCount);
});

test('clicking a province zooms the map to it', async ({ page }) => {
  await openApp(page);
  const full = await viewBox(page);
  // Find a big province whose bbox center actually lands on its own path
  // (archipelago provinces have water at the bbox center).
  const center = await page.evaluate(() => {
    const paths = [...document.querySelectorAll<SVGPathElement>('svg.map path.province')]
      .map((p) => ({ p, b: p.getBoundingClientRect() }))
      .sort((a, b) => b.b.width * b.b.height - a.b.width * a.b.height);
    for (const { p, b } of paths) {
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      if (document.elementFromPoint(x, y) === p) return { x, y };
    }
    return null;
  });
  expect(center).not.toBeNull();
  await page.mouse.click(center!.x, center!.y);
  // The zoom is animated (flyTo), so wait for the view to move.
  await expect.poll(() => viewBox(page), { timeout: 10_000 }).not.toBe(full);
  const zoomed = await viewBox(page);
  expect(Number(zoomed.split(' ')[2])).toBeLessThan(Number(full.split(' ')[2]));
});
