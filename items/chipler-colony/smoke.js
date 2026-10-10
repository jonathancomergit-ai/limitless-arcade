/* ============================================================
   Chipler Colony - smoke test

   Phone:   tap Farm, let it run, tap a plot on the planet,
            tap Copy.
   Desktop: press 1 (farm), let it run, click a plot, press
            the right arrow, press Space (copy).

   Checks: a farm stands on plot 2, the farm made food,
   the selected plot changed, and the population went 1 -> 2.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const read = () => page.evaluate(() => ({
    pop: window.__item.c.chiplers.length,
    plot1: window.__item.c.slots[1] && window.__item.c.slots[1].type,
    made: window.__item.c.stats.food,
    sel: window.__item.sel
  }));
  const tapPlot = async (i) => {
    await page.locator("#stage").scrollIntoViewIfNeeded();
    const box = await page.locator("#stage").boundingBox();
    const p = await page.evaluate((n) => window.__item.slotXY(n), i);
    if (isMobile) { await page.touchscreen.tap(box.x + p.x, box.y + p.y); }
    else { await page.mouse.click(box.x + p.x, box.y + p.y); }
  };

  const start = await read();
  expect(start.pop, "starts with one Chipler").toBe(1);
  expect(start.sel, "plot 2 is picked first").toBe(1);

  /* ---- build a farm ---- */
  if (isMobile) {
    await page.locator("#build-farm").tap();
  } else {
    await page.keyboard.press("Digit1");
  }
  await expect.poll(async () => (await read()).plot1).toBe("farm");
  await expect(page.locator("#plot-title")).toContainText("Farm");

  /* ---- let it run: the Chipler walks over, works, carries food home ---- */
  await expect.poll(async () => (await read()).made, { timeout: 12_000 }).toBeGreaterThan(0);

  /* ---- turn the planet: tap / click another plot ---- */
  await tapPlot(4);
  await expect.poll(async () => (await read()).sel).toBe(4);
  if (!isMobile) {
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await read()).sel).toBe(5);
  }

  /* ---- copy ---- */
  if (isMobile) {
    await page.locator("#copy-btn").tap();
  } else {
    await page.keyboard.press("Space");
  }
  await expect.poll(async () => (await read()).pop).toBe(2);
  await expect(page.locator("#pop")).toHaveText("2/4");
  await expect(page.locator("#roster li")).toHaveCount(2);
}
