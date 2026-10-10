/* ============================================================
   sitemap.xml, from items.json

     npm run sitemap

   Lists the hub and every built item (not "soon" ones), so
   search engines can find each page. lastmod is the item's
   "added" date; the hub's is the newest of those.

   Run it after adding an item. tests/unit/sitemap.test.js
   fails while sitemap.xml is out of date.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "../site.config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITEMAP = path.join(ROOT, "sitemap.xml");

/* This wing's public address, e.g. https://jonjoe1001.dev/limitless-arcade/ */
export const BASE = config.wings.find((w) => w.wing === config.wing).url;

/* Pure: items.json list in, sitemap.xml text out. */
export function buildSitemap(items, base = BASE) {
  const built = items.filter((i) => !i.soon).sort((a, b) => a.slug.localeCompare(b.slug));
  const newest = built.map((i) => i.added).sort().pop();
  const url = (loc, lastmod) =>
    `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </url>\n`;
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    url(base, newest) +
    built.map((i) => url(`${base}items/${i.slug}/`, i.added)).join("") +
    "</urlset>\n";
}

export function readItems() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "items.json"), "utf8"));
}

/* Only write when run as a command, not when a test imports it. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fs.writeFileSync(SITEMAP, buildSitemap(readItems()));
  console.log(`  wrote sitemap.xml`);
}
