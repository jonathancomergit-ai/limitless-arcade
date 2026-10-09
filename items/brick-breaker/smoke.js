/* ============================================================
   Brick Breaker+ - smoke test

   Phone:   tap Start, drag sideways on the stage (a real touch
            drag, sent through Chrome DevTools), then tap to launch.
   Desktop: press Space to start, hold the left arrow, then Space.

   Checks: the paddle moved, the ball launched and moved.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const read = () => page.evaluate(() => {
    const s = window.__item;
    const b = s.balls[0];
    return { mode: s.mode, launches: s.launches, paddle: s.paddle.x, bx: b ? b.x : 0, by: b ? b.y : 0 };
  });

  /* ---- start ---- */
  if (isMobile) {
    await page.locator("#start-btn").tap();
  } else {
    await page.keyboard.press("Space");
  }
  await expect.poll(async () => (await read()).mode).toBe("play");
  await expect(page.locator("#start-screen")).toBeHidden();
  const before = await read();

  /* ---- move the paddle ---- */
  const box = await page.locator("#stage").boundingBox();
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const x0 = Math.round(box.x + box.width / 2), y0 = Math.round(box.y + box.height * 0.6);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y }]
    });
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 8; i++) {
      await touch("touchMove", x0 - i * 10, y0);      // drag left 80 px
      await page.waitForTimeout(20);
    }
    await touch("touchEnd", 0, 0);
  } else {
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(250);
    await page.keyboard.up("ArrowLeft");
  }
  const moved = await read();
  expect(moved.paddle, "the paddle moved left").toBeLessThan(before.paddle - 20);
  expect(moved.launches, "a drag doesn't launch").toBe(0);

  /* ---- launch ---- */
  if (isMobile) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.5);
  } else {
    await page.keyboard.press("Space");
  }
  await expect.poll(async () => (await read()).launches).toBe(1);
  await page.waitForTimeout(200);
  const after = await read();
  expect(Math.hypot(after.bx - moved.bx, after.by - moved.by), "the ball moved").toBeGreaterThan(20);
}
