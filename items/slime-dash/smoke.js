/* ============================================================
   Slime Dash - smoke test

   Phone:   tap Start, then tap the stage to hop.
   Desktop: press Space to start, then Space again to jump.

   Checks: the slime left the ground, and the distance went up.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const read = () => page.evaluate(() => ({
    mode: window.__item.mode,
    jumps: window.__item.jumps,
    peak: window.__item.peak,
    distance: window.__item.distance
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
  expect(before.jumps, "no jump yet").toBe(0);

  /* ---- jump ---- */
  if (isMobile) {
    const box = await page.locator("#stage").boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await page.keyboard.press("Space");
  }

  /* ---- check ---- */
  await expect.poll(async () => (await read()).jumps).toBe(1);
  await expect.poll(async () => (await read()).peak, { message: "the slime left the ground" }).toBeGreaterThan(20);
  const after = await read();
  expect(after.distance, "the distance went up").toBeGreaterThan(before.distance);
  await expect.poll(() => page.evaluate(() => Number(document.getElementById("score").textContent)))
    .toBeGreaterThan(0);
}
