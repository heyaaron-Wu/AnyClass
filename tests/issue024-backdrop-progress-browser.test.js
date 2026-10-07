"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {chromium} = require("playwright");
const {evidenceDirectory} = require("./local-artifacts");

const app = path.resolve(__dirname, "../app");
const evidence = evidenceDirectory("issue024-backdrop-progress");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/timetable/timetable.css"><link rel="stylesheet" href="/assets/timetable/product-shell.css"><link rel="stylesheet" href="/assets/timetable/course-editing.css"><style>body{min-height:1200px!important;background:linear-gradient(135deg,#f6c453 0 25%,#5ac8a8 25% 50%,#5b8ff9 50% 75%,#e76f8a 75%)}main{padding:32px}.under-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.under-grid div{min-height:90px;border:2px solid #fff;background:#ffffff99;color:#10233f;padding:12px}.dialog-body{min-height:460px}</style></head><body data-shell-page="timetable"><main><h1>Underlying timetable</h1><div class="under-grid">${Array.from({length:12},(_,i)=>`<div>Course ${i+1}<br>Week ${i%5+1}</div>`).join("")}</div></main><dialog id="courseDialog" aria-modal="true" aria-labelledby="title"><div class="course-dialog-scrim" data-course-dialog-scrim aria-hidden="true"></div><div class="dialog-body"><div class="sheet-grabber" data-sheet-grabber aria-hidden="true"></div><div class="dialog-head"><h2 id="title">Course detail</h2><button id="close" class="dialog-close" aria-label="Close">×</button></div><label>Course name <input id="courseName" value="Example course"></label><button id="inside" type="button">Inside action</button><div id="scrollContent" style="height:800px">Scrollable content</div></div></dialog><script src="/assets/timetable/product-shell.js"></script><script>const d=document.querySelector('#courseDialog'),b=d.querySelector('.dialog-body');AnyClassMotion.enableSheetDismiss(d,{scrollContainer:b});document.querySelector('#close').onclick=()=>AnyClassMotion.closeDialog(d);window.openSheet=()=>AnyClassMotion.openDialog(d,{focus:document.querySelector('#close')});openSheet()</script></body></html>`;

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  if (pathname === "/__issue024/") {
    response.writeHead(200, {"content-type": "text/html; charset=utf-8"});
    response.end(html);
    return;
  }
  const file = path.resolve(app, "." + pathname);
  if (!file.startsWith(app + path.sep) || !fs.existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {"content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html"});
  response.end(fs.readFileSync(file));
});

function numeric(value) {
  const match = String(value).match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const executablePath = [
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
  ].find(fs.existsSync);
  const browser = await chromium.launch({executablePath, headless: true, args: ["--disable-background-networking"]});
  let assertions = 0;
  const check = (condition, message) => { assert(condition, message); assertions++; };
  const results = [];
  try {
    for (const width of [390, 430]) {
      const context = await browser.newContext({viewport: {width, height: 844}, isMobile: true, hasTouch: true});
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/__issue024/`);
      await page.waitForTimeout(320);
      const dialog = page.locator("#courseDialog");
      const grabber = page.locator("[data-sheet-grabber]");
      const start = await grabber.boundingBox();
      const geometry = await page.locator("#courseDialog .dialog-body").boundingBox();
      check(Boolean(start && geometry), `${width}: sheet geometry available`);
      const x = start.x + start.width / 2;
      const y = start.y + start.height / 2;
      const height = geometry.height;
      const sample = async (label, expected) => {
        await page.waitForTimeout(34);
        const state = await dialog.evaluate(node => {
          const backdrop = getComputedStyle(node.querySelector("[data-course-dialog-scrim]"));
          return {
            progress: Number(node.style.getPropertyValue("--sheet-drag-progress") || 0),
            y: parseFloat(node.style.getPropertyValue("--sheet-drag-y") || 0),
            strength: Number(node.style.getPropertyValue("--sheet-scrim-strength") || 1),
            opacity: Number(backdrop.opacity),
            background: backdrop.backgroundColor,
            filter: backdrop.backdropFilter || backdrop.webkitBackdropFilter,
            gesture: node.dataset.sheetGestureState
          };
        });
        check(Math.abs(state.progress - expected) < .035, `${width} ${label}: normalized progress`);
        check(Math.abs(state.strength - (1 - expected)) < .025, `${width} ${label}: scrim strength follows progress`);
        check(Math.abs(state.opacity - (1 - expected)) < .035, `${width} ${label}: rendered scrim opacity follows progress`);
        check(Math.abs(numeric(state.filter) - 3) < .12, `${width} ${label}: persistent blur compositor remains fixed`);
        await page.screenshot({path: path.join(evidence, `${width}-${label}.png`), fullPage: false});
        results.push({width, label, ...state});
        return state;
      };

      await sample("00-open", 0);
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (const [label, progress] of [["25", .25], ["50-down", .5], ["75", .75], ["92-near-dismiss", .92], ["50-reverse", .5], ["25-reverse", .25], ["00-reverse", 0]]) {
        await page.mouse.move(x, y + height * progress, {steps: 5});
        await sample(label, progress);
      }
      await page.waitForTimeout(100);
      await page.mouse.up();
      await page.waitForFunction(() => document.querySelector("#courseDialog")?.dataset.sheetGestureState === "IDLE");
      check(await dialog.isVisible(), `${width}: reverse-to-zero release keeps sheet open`);
      check(await dialog.evaluate(node => node.dataset.sheetGestureState === "IDLE" && !node.style.getPropertyValue("--sheet-drag-progress") && !node.style.getPropertyValue("--sheet-scrim-strength")), `${width}: snap-back clears visual state`);

      const formBefore = await dialog.evaluate(node => node.style.getPropertyValue("--sheet-drag-progress") || "0");
      await page.locator("#courseName").click();
      await page.locator("#courseName").fill("Edited course");
      await page.locator("#inside").click();
      const formAfter = await dialog.evaluate(node => node.style.getPropertyValue("--sheet-drag-progress") || "0");
      check(formBefore === "0" && formAfter === "0", `${width}: form controls do not claim sheet progress`);
      await dialog.evaluate(node => node.querySelector(".dialog-body").scrollTop = 80);
      const scrolledGrabber = await grabber.boundingBox();
      await page.mouse.move(scrolledGrabber.x + scrolledGrabber.width / 2, scrolledGrabber.y + scrolledGrabber.height / 2);
      await page.mouse.down();
      await page.mouse.move(scrolledGrabber.x + scrolledGrabber.width / 2, scrolledGrabber.y + scrolledGrabber.height / 2 + 40, {steps: 3});
      await page.waitForTimeout(34);
      await page.mouse.up();
      check(await dialog.isVisible(), `${width}: scrolled content remains usable`);
      await context.close();
    }

    const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/__issue024/`);
    await page.waitForTimeout(320);
    const dialog = page.locator("#courseDialog"), grabber = page.locator("[data-sheet-grabber]");
    let box = await grabber.boundingBox(), dimensions = await page.locator("#courseDialog .dialog-body").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dimensions.height * .18, {steps: 4});
    await page.waitForTimeout(120);
    await page.mouse.up();
    const snapStart = await dialog.evaluate(node => ({state: node.dataset.sheetGestureState, progress: Number(node.style.getPropertyValue("--sheet-drag-progress")), strength: Number(node.style.getPropertyValue("--sheet-scrim-strength")), filter:getComputedStyle(node.querySelector('[data-course-dialog-scrim]')).backdropFilter}));
    check(snapStart.state === "SNAP_BACK" && snapStart.progress === 0 && snapStart.strength === 1 && numeric(snapStart.filter) === 3, "below threshold snap synchronizes sheet and persistent scrim targets");
    await page.waitForFunction(() => document.querySelector("#courseDialog")?.dataset.sheetGestureState === "IDLE");
    check(await dialog.isVisible(), "below threshold remains open");

    box = await grabber.boundingBox(); dimensions = await page.locator("#courseDialog .dialog-body").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dimensions.height * .35, {steps: 5});
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(34);
    const dismissing = await dialog.evaluate(node => ({state: node.dataset.sheetGestureState, progress: Number(node.style.getPropertyValue("--sheet-drag-progress")), strength: Number(node.style.getPropertyValue("--sheet-scrim-strength")), filter:getComputedStyle(node.querySelector('[data-course-dialog-scrim]')).backdropFilter}));
    check(dismissing.state === "DISMISS" && dismissing.progress === 1 && dismissing.strength === 0 && numeric(dismissing.filter) === 3, "accepted dismiss fades persistent backdrop compositor to zero strength");
    await dialog.waitFor({state: "hidden"});
    await page.evaluate(() => openSheet());
    await dialog.waitFor({state: "visible"});
    check(await dialog.evaluate(node => node.dataset.sheetGestureState === "IDLE" && !node.style.getPropertyValue("--sheet-drag-progress")), "reopen starts from clean zero progress");
    await context.close();

    const reduced = await browser.newContext({viewport: {width: 430, height: 844}, isMobile: true, hasTouch: true, reducedMotion: "reduce"});
    const reducedPage = await reduced.newPage();
    await reducedPage.goto(`http://127.0.0.1:${server.address().port}/__issue024/`);
    const reducedDialog = reducedPage.locator("#courseDialog"), reducedGrabber = reducedPage.locator("[data-sheet-grabber]");
    box = await reducedGrabber.boundingBox(); dimensions = await reducedPage.locator("#courseDialog .dialog-body").boundingBox();
    await reducedPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await reducedPage.mouse.down();
    await reducedPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dimensions.height * .18, {steps: 4});
    await reducedPage.waitForTimeout(34);
    const reducedDirect = await reducedDialog.evaluate(node => ({progress: Number(node.style.getPropertyValue("--sheet-drag-progress")), strength: Number(node.style.getPropertyValue("--sheet-scrim-strength")), filter:getComputedStyle(node.querySelector('[data-course-dialog-scrim]')).backdropFilter}));
    check(reducedDirect.progress > .1 && reducedDirect.strength < 1 && numeric(reducedDirect.filter) === 3, "reduced motion preserves direct scrim strength with persistent blur");
    await reducedPage.waitForTimeout(120);
    await reducedPage.mouse.up();
    await reducedPage.waitForFunction(() => document.querySelector("#courseDialog")?.dataset.sheetGestureState === "IDLE");
    check(await reducedDialog.isVisible() && await reducedDialog.evaluate(node => node.dataset.sheetGestureState === "IDLE"), "reduced-motion snap is immediate and coherent");
    await reduced.close();

    const performanceContext = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    const performancePage = await performanceContext.newPage();
    await performancePage.goto(`http://127.0.0.1:${server.address().port}/__issue024/`);
    await performancePage.waitForTimeout(320);
    await performancePage.evaluate(() => {
      window.__issue024Frames = [];
      window.__issue024LongTasks = [];
      window.__issue024Sampling = true;
      let previous;
      const sample = time => {
        if (previous !== undefined) window.__issue024Frames.push(time - previous);
        previous = time;
        if (window.__issue024Sampling) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      if (typeof PerformanceObserver === "function" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
        const observer = new PerformanceObserver(list => window.__issue024LongTasks.push(...list.getEntries().map(entry => entry.duration)));
        observer.observe({entryTypes: ["longtask"]});
        window.__issue024Observer = observer;
      }
    });
    box = await performancePage.locator("[data-sheet-grabber]").boundingBox();
    dimensions = await performancePage.locator("#courseDialog .dialog-body").boundingBox();
    await performancePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await performancePage.mouse.down();
    for (let step = 1; step <= 36; step++) {
      const fraction = step <= 24 ? step / 48 : (48 - step) / 48;
      await performancePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dimensions.height * fraction);
      await performancePage.waitForTimeout(12);
    }
    await performancePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await performancePage.waitForTimeout(100);
    await performancePage.mouse.up();
    await performancePage.waitForFunction(() => document.querySelector("#courseDialog")?.dataset.sheetGestureState === "IDLE");
    const performanceResult = await performancePage.evaluate(() => {
      window.__issue024Sampling = false;
      window.__issue024Observer?.disconnect();
      const frames = window.__issue024Frames.slice(3).sort((a, b) => a - b);
      return {
        frames: frames.length,
        p95: frames[Math.min(frames.length - 1, Math.floor(frames.length * .95))] || 0,
        max: frames.at(-1) || 0,
        longTasks: window.__issue024LongTasks
      };
    });
    check(performanceResult.frames >= 20, "performance sampling captured sustained drag frames");
    check(performanceResult.p95 < 50, "sustained drag frame p95 remains below 50ms in browser acceptance");
    check(performanceResult.longTasks.every(duration => duration < 100), "sustained drag introduces no severe long task");
    await performanceContext.close();

    fs.writeFileSync(path.join(evidence, "measurements.json"), JSON.stringify({result: "ISSUE024_BACKDROP_PROGRESS_PASS", assertions, samples: results, performance: performanceResult}, null, 2));
    console.log(JSON.stringify({result: "ISSUE024_BACKDROP_PROGRESS_PASS", assertions, evidence, performance: performanceResult}, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
