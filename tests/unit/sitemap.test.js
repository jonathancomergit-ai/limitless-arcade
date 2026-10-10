/* ============================================================
   sitemap.xml stays in step with items.json

   Out of date? Run:  npm run sitemap
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildSitemap, readItems, SITEMAP, BASE } from "../../scripts/build-sitemap.js";

test("sitemap.xml matches items.json (fix: npm run sitemap)", () => {
  assert.ok(fs.existsSync(SITEMAP), "sitemap.xml is missing - run npm run sitemap");
  const onDisk = fs.readFileSync(SITEMAP, "utf8").replace(/\r\n/g, "\n");
  assert.equal(onDisk, buildSitemap(readItems()), "sitemap.xml is out of date - run npm run sitemap");
});

test("the sitemap lists the hub and built items, never soon ones", () => {
  const xml = buildSitemap([
    { slug: "b-game", added: "2026-10-02" },
    { slug: "a-game", added: "2026-10-05" },
    { slug: "later", added: "2026-10-09", soon: true }
  ], "https://example.dev/wing/");
  assert.match(xml, /<loc>https:\/\/example\.dev\/wing\/<\/loc>\n    <lastmod>2026-10-05<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/example\.dev\/wing\/items\/a-game\/<\/loc>\n    <lastmod>2026-10-05<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/example\.dev\/wing\/items\/b-game\/<\/loc>\n    <lastmod>2026-10-02<\/lastmod>/);
  assert.doesNotMatch(xml, /later/);
  assert.ok(xml.indexOf("a-game") < xml.indexOf("b-game"), "items in slug order");
});

test("the sitemap points at this wing's live address", () => {
  assert.match(BASE, /^https:\/\/jonjoe1001\.dev\/[a-z-]+\/$/);
});
