import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const out = new URL("../out/", import.meta.url);

test("GitHub Pages 정적 파일이 생성된다", async () => {
  const html = await readFile(new URL("index.html", out), "utf8");
  assert.match(html, /서코 334 부스맵/);
  assert.match(html, /_next\/static/);
  await stat(new URL("map-334.jpg", out));
  await stat(new URL("og.png", out));
});

test("부스 데이터가 정적 결과물에 포함된다", async () => {
  const data = JSON.parse(await readFile(new URL("data/booths-334.json", out), "utf8"));
  assert.equal(data.stats.booths, 1808);
  assert.equal(data.stats.satKeys, 2422);
  assert.equal(data.stats.sunKeys, 2421);
});
