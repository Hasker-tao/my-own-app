import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("production HTML contains the local app entry point and no remote runtime assets", () => {
  const html = fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const assetsDirectory = new URL("../dist/assets/", import.meta.url);
  const css = fs.readdirSync(assetsDirectory)
    .filter((file) => file.endsWith(".css"))
    .map((file) => fs.readFileSync(new URL(file, assetsDirectory), "utf8"))
    .join("\n");
  assert.match(html, /<title>hasker工作台<\/title>/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\/assets\/brand\/hasker-mark\.svg/);
  assert.doesNotMatch(html, /https?:\/\/(fonts|cdn|unpkg|jsdelivr)\./i);
  assert.match(html, /\/assets\//);
  for (const file of ["chromatic-polymer-light-v1.webp", "chromatic-polymer-dark-v1.webp"]) {
    assert.equal(fs.existsSync(new URL(`../dist/assets/ambient/${file}`, import.meta.url)), true, `${file} should be bundled locally`);
    assert.match(css, new RegExp(`/assets/ambient/${file.replace(".", "\\.")}`));
  }
  for (const module of ["dashboard", "today", "media", "development", "consulting", "fitness", "diet", "entertainment", "settings"]) {
    const file = `${module}-v1.webp`;
    assert.equal(fs.existsSync(new URL(`../dist/assets/module-icons/${file}`, import.meta.url)), true, `${file} should be bundled locally`);
  }
  for (const file of ["muzi-app-icon-v1.webp", "muzi-app-icon-v1.png", "favicon-64-v1.png"]) {
    assert.equal(fs.existsSync(new URL(`../dist/assets/brand/${file}`, import.meta.url)), true, `${file} should be bundled locally`);
  }
  for (const file of ["brand/hasker-mark.svg", "brand/muzi-mark.svg", "notebook/module-stickers.png"]) {
    assert.equal(fs.existsSync(new URL(`../dist/assets/${file}`, import.meta.url)), true, `${file} should be bundled locally`);
  }
  for (const file of ["module-emblems.png", "muzi-app-icon-v1.png", "muzi-app-icon-brand.png", "muzi-app-icon-favicon.png"]) {
    assert.equal(fs.existsSync(new URL(`../dist/assets/neo/${file}`, import.meta.url)), true, `${file} should be bundled locally`);
  }
  assert.match(css, /:root\[data-appearance=neo\]/);
  assert.match(css, /\/assets\/neo\/module-emblems\.png/);
});
