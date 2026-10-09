/* ============================================================
   Gravity Golf - smoke test

   Phone:   tap "Tee off", then a real touch drag (sent through
            Chrome DevTools): pull back down from the ball, let go.
   Desktop: press Space to start, nudge the aim with the arrow
            keys, then Space to shoot.

   Checks: strokes became 1 and the ball moved.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const read = () => page.evaluate(() => ({
    mode: window.__item.mode,
    strokes: window.__item.strokes,
    x: window.__item.ball.x,
    y: window.__item.ball.y,
    power: window.__item.aim.power
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
  expect(before.strokes).toBe(0);

  /* ---- shoot ---- */
  if (isMobile) {
    const box = await page.locator("#stage").boundingBox();
    const ball = await page.evaluate(() => window.__item.ballOnScreen());
    const cdp = await page.context().newCDPSession(page);
    const x0 = Math.round(box.x + ball.x);
    const y0 = Math.round(box.y + ball.y);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y }]
    });
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 8; i++) {
      await touch("touchMove", x0 + i, y0 + i * 8);     // pull back down 64 px
      await page.waitForTimeout(25);
    }
    expect((await read()).power, "the drag sets the power").toBeGreaterThan(0.2);
    await touch("touchEnd", 0, 0);
  } else {
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(150);
    await page.keyboard.up("ArrowRight");
    await page.keyboard.press("Space");
  }

  /* ---- check ---- */
  await expect.poll(async () => (await read()).strokes).toBe(1);
  await expect(page.locator("#strokes")).toHaveText("1");
  await page.waitForTimeout(200);
  const after = await read();
  expect(Math.hypot(after.x - before.x, after.y - before.y), "the ball moved").toBeGreaterThan(10);
}
