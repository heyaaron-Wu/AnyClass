"use strict";
const assert = require("node:assert/strict");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const {chromium} = require("playwright");
const site = path.resolve(__dirname, "../app");
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, "http://local").pathname);
  if (name.endsWith("/")) name += "index.html";
  const file = path.resolve(site, "." + name);
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {"content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html", "cache-control": "no-store"});
  res.end(fs.readFileSync(file));
});
const fixture = {schemaVersion: 1, school: {id: "school-demo", name: "Example University"}, semester: {academicYear: "2026-2027", term: "1"}, meetings: [
  {courseName: "Course A", weekday: 1, startPeriod: 7, endPeriod: 8, weeks: [13, 15], teacher: "Teacher A", locationRaw: "Building A101"},
  {courseName: "Course B", weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [14, 16], teacher: "Teacher B", locationRaw: "Building B202"}
]};
const executablePath = [path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"), path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")].find(fs.existsSync);
const measure = page => page.evaluate(() => {
  const rect = selector => {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    return r ? {x: r.x, width: r.width} : null;
  };
  return {week: document.querySelector("#weekTitle")?.textContent.trim(), rows: document.querySelectorAll("#weekGrid .period-label").length, main: rect("main.shell"), previous: rect("#previous"), next: rect("#next"), grid: rect("#weekGrid"), dock: rect(".shell-bottom-nav"), documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, viewportWidth: innerWidth, contentWidth: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > innerWidth + 1, gutter: getComputedStyle(document.documentElement).scrollbarGutter};
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({executablePath, headless: true, args: ["--disable-background-networking", "--disable-features=OverlayScrollbar"]});
  try {
    const results = [];
    for (const width of [1024, 1280, 1440, 390, 430]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({viewport: {width, height: width < 700 ? 844 : 1000}, colorScheme: theme, isMobile: width < 700, hasTouch: width < 700});
      const page = await context.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      const base = `http://127.0.0.1:${server.address().port}`;
      await page.goto(`${base}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture))});
      await page.locator("#filePreview:not([hidden])").waitFor();
      if (await page.locator("#fileSemesterStart").isVisible()) await page.locator("#fileSemesterStart").fill("2026-08-31");
      await page.locator("#fileSave").click();
      await page.waitForFunction(() => /已保存/.test(document.querySelector("#fileSubmitMessage")?.textContent || ""));
      await page.goto(`${base}/timetable/`);
      await page.locator("#app:not([hidden])").waitFor();
      while (await page.locator("#previous").isEnabled()) await page.locator("#previous").click();
      for (let week = 1; week < 13; week++) await page.locator("#next").click();
      const samples = [await measure(page)];
      for (const target of [14, 15, 16]) { await page.locator("#next").click(); samples.push(await measure(page)); assert.match(samples.at(-1).week, new RegExp(`第 ${target} 周`)); }
      for (let week = 16; week > 13; week--) await page.locator("#previous").click();
      samples.push(await measure(page));
      assert.deepEqual(samples.map(s => s.rows), [8, 4, 8, 4, 8]);
      if (width >= 700) assert.deepEqual(samples.map(s => s.documentHeight > s.viewportHeight), [true, false, true, false, true]);
      for (const property of ["main", "previous", "next", "grid", "dock"]) {
        const baseline = samples[0][property];
        if (!baseline) continue;
        for (const sample of samples) {
          assert(Math.abs(sample[property].x - baseline.x) < 0.25, `${width} ${theme} ${property} shifted: ${JSON.stringify(samples)}`);
          assert(Math.abs(sample[property].width - baseline.width) < 0.25, `${width} ${theme} ${property} width changed`);
        }
      }
      assert(samples.every(s => !s.overflowX));
      assert(samples.every(s => s.gutter === (width < 700 ? "auto" : "stable")), `${width} ${theme} gutter: ${samples.map(s => s.gutter)}`);
      assert.deepEqual(errors, []);
      results.push({width, theme, rows: samples.map(s => s.rows), x: samples.map(s => s.main.x), heights: samples.map(s => s.documentHeight), viewportHeight: samples[0].viewportHeight, scrollable: samples.map(s => s.documentHeight > s.viewportHeight), gutter: samples[0].gutter});
      await context.close();
    }
    console.log(JSON.stringify({result: "PASS", sequence: "13>14>15>16>13", results}, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
