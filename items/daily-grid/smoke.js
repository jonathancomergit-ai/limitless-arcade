/* ============================================================
   Daily Grid - smoke test

   Phone:   tap the top-left tile.
   Desktop: arrow keys to move the cursor, then Space to flip.

   Checks: the move count is 1, and the tiles changed.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#board[data-ready]")).toHaveCount(1);
  await expect(page.locator(".dg-tile")).toHaveCount(25);
  const read = () => page.evaluate(() => ({ moves: window.__item.moves, board: window.__item.board }));
  const lit = () => page.locator(".dg-tile.is-on").evaluateAll((ts) => ts.map((t) => t.dataset.i).join(","));

  const before = await read();
  const litBefore = await lit();
  expect(before.moves).toBe(0);
  expect(before.board, "today's puzzle has lit tiles").not.toBe(0);

  if (isMobile) {
    await page.locator(".dg-tile").first().tap();
  } else {
    await page.keyboard.press("ArrowRight");     // cursor 12 -> 13
    await page.keyboard.press("ArrowUp");        // 13 -> 8
    await page.keyboard.press("Space");
  }

  await expect.poll(async () => (await read()).moves).toBe(1);
  await expect(page.locator("#moves")).toHaveText("1");
  const after = await read();
  expect(after.board, "the tiles changed").not.toBe(before.board);
  expect(await lit(), "the lit tiles on screen changed").not.toBe(litBefore);

  /* Undo puts it back. */
  await page.locator("#undo").click();
  await expect.poll(async () => (await read()).moves).toBe(0);
  expect((await read()).board).toBe(before.board);
}
