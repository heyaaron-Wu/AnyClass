"use strict";
const assert = require("node:assert/strict");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const {chromium} = require("playwright");
const site = path.resolve(__dirname, "../app"), out = require("./local-artifacts").evidenceDirectory("visual-closeout");
const executablePath = [path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"), path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")].find(fs.existsSync);
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, "http://local").pathname);
  if (name.endsWith("/")) name += "index.html";
  const file = path.resolve(site, "." + name);
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {"content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html", "cache-control": "no-store"});
  res.end(fs.readFileSync(file));
});
const fixture = {schemaVersion: 1, school: {id: "school-demo", name: "Example University"}, semester: {academicYear: "2026-2027", term: "1"}, meetings: [
  {courseName: "Course A", weekday: 1, startPeriod: 3, endPeriod: 4, weeks: Array.from({length: 16}, (_, i) => i + 1), teacher: "Teacher A", locationRaw: "Building A101"},
  {courseName: "Course B", weekday: 4, startPeriod: 7, endPeriod: 8, weeks: Array.from({length: 16}, (_, i) => i + 1), teacher: "Teacher B", locationRaw: "Building B202"}
]};
const routes = [["today", "/today/"], ["timetable", "/timetable/"], ["settings", "/settings/"], ["import", "/import/"], ["local-data", "/local-status/"], ["export", "/export/"], ["about", "/about/"]];
(async () => {
  fs.mkdirSync(out, {recursive: true});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath, headless: true, args: ["--disable-background-networking", "--disable-features=OverlayScrollbar"]});
  const results = [];
  try {
    for (const [width, theme] of [[390, "light"], [430, "light"], [1024, "light"], [1440, "light"], [390, "dark"], [1440, "dark"]]) {
      const context = await browser.newContext({viewport: {width, height: width < 700 ? 844 : 900}, colorScheme: theme, isMobile: width < 700, hasTouch: width < 700});
      const page = await context.newPage();
      const errors = []; page.on("pageerror", e => errors.push(e.message));
      await page.goto(`${base}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture))});
      await page.locator("#filePreview:not([hidden])").waitFor();
      if (await page.locator("#fileSemesterStart").isVisible()) await page.locator("#fileSemesterStart").fill("2026-08-31");
      await page.locator("#fileSave").click();
      await page.waitForFunction(() => /已保存/.test(document.querySelector("#fileSubmitMessage")?.textContent || ""));
      for (const [name, route] of routes) {
        await page.goto(base + route);
        await page.locator("main").waitFor();
        await page.waitForTimeout(450);
        const geometry = await page.evaluate(() => { const card=document.querySelector(".panel:not(.hero-card),.card:not(.hero-card)"), dock=document.querySelector(".shell-bottom-nav"), hero=document.querySelector(".hero-card"); return {overflow: document.documentElement.scrollWidth > innerWidth + 1, background: getComputedStyle(document.documentElement).backgroundColor, theme: document.querySelector('meta[name="theme-color"][media*="light"]')?.content, card: card ? getComputedStyle(card).backgroundColor : null, dock: dock ? getComputedStyle(dock).backgroundColor : null, hero: hero ? getComputedStyle(hero).backgroundImage : null}; });
        assert(!geometry.overflow, `${name}-${width}-${theme} horizontal overflow`);
        assert.equal(geometry.theme, "#f3f0e8");
        if(theme==="light"){
          assert.equal(geometry.background,"rgb(243, 240, 232)");
          if(geometry.card)assert.match(geometry.card,/255, 253, 249/);
          if(geometry.dock)assert.match(geometry.dock,/255, 253, 249/);
          if(name==="today")assert.match(geometry.hero,/(?:21, 60, 131|33, 63, 112)/);
        }
        await page.screenshot({path: path.join(out, `${name}-${width}-${theme}.png`), fullPage: false});
        results.push({name, width, theme, ...geometry});
      }
      if (width === 1024 && theme === "light") {
        await page.goto(`${base}/settings/`);
        await page.locator(".shell-brand").click();
        await page.waitForURL(`${base}/`);
        const transition = await page.evaluate(() => ({active: document.documentElement.dataset.crossPageTransition === "true", duration: getComputedStyle(document.documentElement, "::view-transition-new(root)").animationDuration, animation: getComputedStyle(document.documentElement, "::view-transition-new(root)").animationName, dockX: document.querySelector(".shell-bottom-nav")?.getBoundingClientRect().x}));
        assert(transition.active, "same-origin cross-document transition did not start");
        assert.match(transition.animation,/shell-cross-page-in/);
        assert(transition.duration.split(",").some(value => Math.abs(parseFloat(value) - .24) < .01));
        const dockBefore = transition.dockX;
        await page.waitForTimeout(350);
        await page.locator('.shell-bottom-nav a[href="/timetable/"]').click();
        await page.waitForURL(`${base}/timetable/`);
        await page.waitForTimeout(350);
        const dockAfter = await page.locator(".shell-bottom-nav").evaluate(node => node.getBoundingClientRect().x);
        assert(Math.abs(dockAfter - dockBefore) < .25, "Dock shifted between top-level pages");
        transition.dockStable = true;
        results.push({name: "cross-page-transition", width, theme, ...transition});
      }
      if (page.url() !== `${base}/timetable/`) await page.goto(`${base}/timetable/`);
      await page.locator("#app:not([hidden])").waitFor();
      const card = page.locator(width < 700 ? ".mobile-course" : ".course-card").first();
      if (await card.count()) {
        await card.click();
        await page.locator("dialog[open]").first().waitFor();
        await page.waitForTimeout(400);
        await page.screenshot({path: path.join(out, `course-detail-${width}-${theme}.png`)});
        const border = await page.locator("dialog[open]").first().evaluate(node => ({width: getComputedStyle(node).borderTopWidth, radius: getComputedStyle(node).borderTopLeftRadius, body: getComputedStyle(node.querySelector(".dialog-body")).borderTopWidth}));
        if (width < 700) { assert.equal(border.width, "0px"); assert.notEqual(border.body, "0px"); }
        else { assert.notEqual(border.width, "0px"); assert.equal(border.body, "0px"); }
        results.push({name: "course-detail", width, theme, border});
      }
      assert.deepEqual(errors, [], `${width}-${theme} page errors`);
      await context.close();
    }
    const context = await browser.newContext({viewport: {width: 1024, height: 900}, colorScheme: "light", reducedMotion: "reduce"});
    const page = await context.newPage(); await page.goto(`${base}/today/`);
    const reduced = await page.evaluate(() => ({motion: matchMedia("(prefers-reduced-motion: reduce)").matches, entry: getComputedStyle(document.querySelector("main")).animationName, transitionRule: [...document.styleSheets].some(sheet => {try {return [...sheet.cssRules].some(rule => rule.cssText.startsWith("@view-transition"));} catch {return false;}})}));
    assert(reduced.motion); assert.equal(reduced.entry, "none"); assert(reduced.transitionRule);
    await context.close();
    console.log(JSON.stringify({result: "PASS", screenshots: results.filter(r => r.name !== "cross-page-transition").length, out, reducedMotion: reduced, results}, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
