"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");
const {chromium} = require("playwright");
const {evidenceDirectory} = require("./local-artifacts");

const app = path.resolve(__dirname, "../app");
const evidence = evidenceDirectory("issue025-dialog-layer");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/timetable/timetable.css"><link rel="stylesheet" href="/assets/timetable/product-shell.css"><link rel="stylesheet" href="/assets/timetable/course-editing.css"><style>body{min-height:100dvh!important;margin:0!important;background:#f6c453!important}.underlay{position:fixed;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.underlay div:nth-child(1){background:#f6c453}.underlay div:nth-child(2){background:#5ac8a8}.underlay div:nth-child(3){background:#5b8ff9}.underlay div:nth-child(4){background:#e76f8a}.dialog-body{height:500px;min-height:500px}</style></head><body data-shell-page="timetable"><div class="underlay"><div></div><div></div><div></div><div></div></div><button id="behind" style="position:fixed;top:40px;left:40px">Underlying action</button><dialog id="courseDialog" aria-modal="true" aria-labelledby="title"><div class="course-dialog-scrim" data-course-dialog-scrim aria-hidden="true"></div><div class="dialog-body"><div class="sheet-grabber" data-sheet-grabber aria-hidden="true"></div><div class="dialog-head"><h2 id="title">Course detail</h2><button id="close" class="dialog-close" aria-label="Close">×</button></div><label>Course name <input id="courseName" value="Example course"></label><div style="height:720px">Scrollable content</div></div></dialog><script src="/assets/timetable/product-shell.js"></script><script>const d=document.querySelector('#courseDialog'),b=d.querySelector('.dialog-body'),s=d.querySelector('[data-course-dialog-scrim]');window.behindClicks=0;window.scrimCloses=0;document.querySelector('#behind').onclick=()=>behindClicks++;AnyClassMotion.enableSheetDismiss(d,{scrollContainer:b});s.onclick=()=>{scrimCloses++;AnyClassMotion.closeDialog(d)};document.querySelector('#close').onclick=()=>AnyClassMotion.closeDialog(d);window.openSheet=()=>AnyClassMotion.openDialog(d,{focus:document.querySelector('#close')});openSheet()</script></body></html>`;

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  if (pathname === "/__issue025/") {
    response.writeHead(200, {"content-type": "text/html; charset=utf-8"});
    response.end(html);
    return;
  }
  const file = path.resolve(app, "." + pathname);
  if (!file.startsWith(app + path.sep) || !fs.existsSync(file)) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, {"content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html"});
  response.end(fs.readFileSync(file));
});

function pngPixel(buffer, x, y) {
  let offset = 8, width, height, depth, colorType;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString("ascii", offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); depth = chunk[8]; colorType = chunk[9]; }
    if (type === "IDAT") data.push(chunk);
    offset += length + 12;
  }
  assert.equal(depth, 8, "screenshot PNG uses 8-bit channels");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert(channels, `supported screenshot color type: ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(data)), stride = width * channels, rows = Buffer.alloc(stride * height);
  let source = 0;
  for (let row = 0; row < height; row++) {
    const filter = raw[source++], target = row * stride;
    for (let column = 0; column < stride; column++) {
      const value = raw[source++], left = column >= channels ? rows[target + column - channels] : 0;
      const up = row ? rows[target + column - stride] : 0;
      const upLeft = row && column >= channels ? rows[target + column - stride - channels] : 0;
      let decoded = value;
      if (filter === 1) decoded += left;
      else if (filter === 2) decoded += up;
      else if (filter === 3) decoded += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        decoded += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else assert.equal(filter, 0, `supported PNG filter: ${filter}`);
      rows[target + column] = decoded & 255;
    }
  }
  const index = Math.max(0, Math.min(height - 1, Math.round(y))) * stride + Math.max(0, Math.min(width - 1, Math.round(x))) * channels;
  return [...rows.subarray(index, index + 3)];
}

function cssRgb(value) {
  const channels = String(value).match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `parse CSS color: ${value}`);
  return channels;
}

const distance = (a, b) => a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0);

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const executablePath = [
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
  ].find(fs.existsSync);
  const browser = await chromium.launch({executablePath, headless: true, args: ["--disable-background-networking"]});
  let assertions = 0;
  const check = (condition, message) => { assert(condition, message); assertions++; };
  const samples = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [390, 430]) for (const height of [700, 932]) {
      const context = await browser.newContext({viewport: {width, height}, isMobile: true, hasTouch: true, colorScheme: theme});
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/__issue025/`);
      await page.waitForTimeout(700);
      const dialog = page.locator("#courseDialog"), body = page.locator("#courseDialog .dialog-body"), scrim = page.locator("[data-course-dialog-scrim]");
      const openBody = await body.boundingBox();
      const layers = await dialog.evaluate(node => {
        const host = getComputedStyle(node), panel = getComputedStyle(node.querySelector(".dialog-body"));
        const visual = getComputedStyle(node.querySelector("[data-course-dialog-scrim]")), native = getComputedStyle(node, "::backdrop");
        return {hostBackground:host.backgroundColor,hostBorder:host.borderTopWidth,hostShadow:host.boxShadow,hostOverflow:host.overflow,panelBackground:panel.backgroundColor,panelPosition:panel.position,panelOverflow:panel.overflowY,scrimBackground:visual.backgroundColor,scrimFilter:visual.backdropFilter||visual.webkitBackdropFilter,nativeBackground:native.backgroundColor,nativeFilter:native.backdropFilter||native.webkitBackdropFilter};
      });
      check(layers.hostBackground === "rgba(0, 0, 0, 0)", `${theme} ${width}x${height}: host is transparent`);
      check(layers.hostBorder === "0px" && layers.hostShadow === "none", `${theme} ${width}x${height}: host has no sheet border or shadow`);
      check(layers.panelBackground !== "rgba(0, 0, 0, 0)" && layers.panelPosition === "absolute", `${theme} ${width}x${height}: moving body owns opaque surface`);
      check(layers.nativeBackground === "rgba(0, 0, 0, 0)" && (layers.nativeFilter === "none" || layers.nativeFilter === "blur(0px)"), `${theme} ${width}x${height}: native backdrop does not duplicate scrim`);
      check(layers.scrimBackground !== "rgba(0, 0, 0, 0)" && layers.scrimFilter.includes("blur"), `${theme} ${width}x${height}: custom scrim owns dim and blur`);
      check(Math.abs((await dialog.boundingBox()).height - height) <= 1, `${theme} ${width}x${height}: host tracks current visual viewport height`);
      const panelColor = cssRgb(layers.panelBackground);
      for (const progress of [0, .25, .5, .75, .92]) {
        await dialog.evaluate((node, value) => {
          const panel = node.querySelector(".dialog-body"), distance = panel.getBoundingClientRect().height * value;
          node.dataset.sheetDragging = "true";
          node.style.setProperty("--sheet-drag-y", `${distance}px`);
          node.style.setProperty("--sheet-drag-progress", String(value));
          node.style.setProperty("--sheet-scrim-strength", String(1 - value));
        }, progress);
        await page.waitForTimeout(40);
        const current = await body.boundingBox();
        check(Math.abs((current.y - openBody.y) - openBody.height * progress) < 2, `${theme} ${width}x${height} ${progress}: whole panel follows progress`);
        const shot = await page.screenshot({path:path.join(evidence, `${theme}-${width}x${height}-${String(progress).replace(".", "_")}.png`)});
        if (progress > 0) {
          const sampleY = openBody.y + Math.max(8, (current.y - openBody.y) / 2), pixel = pngPixel(shot, width * .25, sampleY);
          check(distance(pixel, panelColor) > 24, `${theme} ${width}x${height} ${progress}: exposed rendered pixel is not panel surface`);
          samples.push({theme,width,height,progress,sample:[Math.round(width*.25),Math.round(sampleY)],pixel,panelColor,distance:distance(pixel,panelColor)});
        }
      }
      await dialog.evaluate(node => { node.style.setProperty("--sheet-drag-y", `${node.querySelector('.dialog-body').getBoundingClientRect().height*.25}px`);node.style.setProperty("--sheet-drag-progress", ".25");node.style.setProperty("--sheet-scrim-strength", ".75"); });
      await page.waitForTimeout(120);
      check(Math.abs((await body.boundingBox()).y - (openBody.y + openBody.height * .25)) < 2, `${theme} ${width}x${height}: reverse drag returns to prior semantic position`);
      await dialog.evaluate(node => { delete node.dataset.sheetDragging; for (const name of ["--sheet-drag-y","--sheet-drag-progress","--sheet-scrim-strength"]) node.style.removeProperty(name); });
      await page.waitForTimeout(120);
      const clearedBody = await body.boundingBox();
      check(Math.abs(clearedBody.y - openBody.y) < 2, `${theme} ${width}x${height}: visual state clears to open position (${clearedBody.y} vs ${openBody.y})`);
      await scrim.click({position:{x:10,y:10}});
      await dialog.waitFor({state:"hidden"});
      check(await page.evaluate(() => scrimCloses === 1 && behindClicks === 0), `${theme} ${width}x${height}: scrim closes once without click-through`);
      await page.evaluate(() => openSheet());
      await dialog.waitFor({state:"visible"});
      check(await dialog.evaluate(node => node.dataset.sheetGestureState === "IDLE" && !node.style.getPropertyValue("--sheet-drag-progress")), `${theme} ${width}x${height}: reopen has no stale visual state`);
      await context.close();
    }
    fs.writeFileSync(path.join(evidence, "measurements.json"), JSON.stringify({result:"ISSUE025_DIALOG_LAYER_PASS",assertions,samples}, null, 2));
    console.log(JSON.stringify({result:"ISSUE025_DIALOG_LAYER_PASS",assertions,evidence,sampleCount:samples.length}, null, 2));
  } finally {
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
