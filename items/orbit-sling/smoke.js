/* ============================================================
   Orbit Sling - smoke test

   Phone:   tap Start, then tap the stage to let go.
   Desktop: press Space to start, then Space again to let go.

   Checks: the ship went from orbiting to flying, and moved.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const read = () => page.evaluate(() => ({
    mode: window.__item.mode,
    phase: window.__item.phase,
    launches: window.__item.launches,
    x: window.__item.ship.x,
    y: window.__item.ship.y
  }));

  /* ---- start ---- */
  if (isMobile) {
    await page.locator("#start-btn").tap();
  } else {
    await page.keyboard.press("Space");
  }
  await expect.poll(async () => (await read()).mode).toBe("play");
  await expect(page.locator("#start-screen")).toBeHidden();
  const before = await read();
  expect(before.phase, "starts in orbit").toBe("orbit");

  /* ---- let go ---- */
  if (isMobile) {
    const box = await page.locator("#stage").boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.8);
  } else {
    await page.keyboard.press("Space");
  }

  /* ---- check ---- */
  await expect.poll(async () => (await read()).launches).toBe(1);
  await expect.poll(async () => (await read()).phase).toBe("fly");
  await page.waitForTimeout(150);
  const after = await read();
  expect(Math.hypot(after.x - before.x, after.y - before.y), "the ship moved").toBeGreaterThan(5);
}
