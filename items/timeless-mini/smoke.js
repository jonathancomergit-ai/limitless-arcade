/* ============================================================
   Timeless Mini - smoke test

   Phone:   tap Start, then drag on the stage (a real touch drag,
            sent through Chrome DevTools) to work the virtual stick.
   Desktop: press Space to start, then hold D (move right).

   Checks: the game is playing, the clock went down, the player moved.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const read = () => page.evaluate(() => ({
    mode: window.__item.mode,
    clock: window.__item.clock,
    x: window.__item.player.x,
    y: window.__item.player.y
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

  /* ---- move ---- */
  if (isMobile) {
    const box = await page.locator("#stage").boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x0 = Math.round(box.x + box.width / 2);
    const y0 = Math.round(box.y + box.height * 0.7);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y }]
    });
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 10; i++) {
      await touch("touchMove", x0 - i * 6, y0);       // drag left 60 px
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(500);                    // hold the stick
    await touch("touchEnd", 0, 0);
  } else {
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyD");
  }

  /* ---- check ---- */
  await page.waitForTimeout(300);
  const after = await read();
  expect(after.clock, "the clock should drain").toBeLessThan(before.clock);
  if (isMobile) {
    expect(after.x, "dragging left should move the player left").toBeLessThan(before.x - 20);
  } else {
    expect(after.x, "holding D should move the player right").toBeGreaterThan(before.x + 20);
  }
  await expect(page.locator("#clock")).not.toHaveText("0:30.0");
}
