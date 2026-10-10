/* ============================================================
   Stack Tower - smoke test

   Drops 3 blocks the way a player would, each time waiting
   until the sliding block is near the middle so it lands on
   the tower.
     Phone:   taps the stage.
     Desktop: one mouse click on the stage, then Space twice.

   Checks: 3 blocks landed, the tower height went up, and the
   HUD shows it. The game is still on (nothing fell).
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const read = () => page.evaluate(() => ({
    mode: window.__item.mode,
    blocks: window.__item.blocks,
    height: window.__item.height
  }));

  const before = await read();
  expect(before.blocks, "no blocks yet").toBe(0);
  expect(before.height, "no tower yet").toBe(0);

  const box = await page.locator("#stage").boundingBox();
  for (let i = 0; i < 3; i++) {
    /* wait for the next block, near the middle of its swing */
    await page.waitForFunction(
      () => window.__item.slider.visible && Math.abs(window.__item.slider.x) < 0.25,
      null, { polling: "raf", timeout: 10_000 }
    );
    if (isMobile) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else if (i === 0) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await page.keyboard.press("Space");
    }
    await expect.poll(async () => (await read()).blocks, { message: `block ${i + 1} landed`, timeout: 6000 })
      .toBe(i + 1);
  }

  await expect.poll(async () => (await read()).height, { message: "the tower got taller", timeout: 6000 })
    .toBeGreaterThan(1);
  const after = await read();
  expect(after.mode, "the tower is still standing").toBe("play");
  await expect(page.locator("#height")).not.toHaveText("0.0 m");
  await expect(page.locator("#best")).not.toHaveText("0.0 m");
}
