"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const site = path.resolve(__dirname, "../app");
const executablePath = [path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"), path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")].find(fs.existsSync);
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, "http://local").pathname);
  if (name.endsWith("/")) name += "index.html";
  const file = path.resolve(site, "." + name);
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html" });
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    for (const width of [390, 430, 1024, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`http://127.0.0.1:${server.address().port}/import/`);
      const entry = page.locator("#chooseClipboard");
      assert(await entry.isVisible(), `${width}: JSON / AI entry is visible on first view`);
      assert.match(await entry.innerText(), /AI 辅助导入/, `${width}: AI is named at top level`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal overflow`);
      await entry.click();
      assert(await page.locator("#clipboard-import").isVisible(), `${width}: shared JSON panel opens`);
      const helper = page.locator(".clipboard-ai-help summary");
      assert.match(await helper.innerText(), /AI 辅助/, `${width}: AI helper is labelled`);
      await helper.click();
      assert.match(await page.locator("#clipboardPrompt").inputValue(), /anyclass-json-prompt-v5-cell-evidence-locked/, `${width}: cell-evidence-locked prompt v5 remains available`);
      assert.match(await page.locator(".clipboard-ai-help").innerText(), /AI 辅助导入目前仍处于实验阶段/, `${width}: experimental warning is scoped to AI help`);
      await page.close();
    }
    console.log(JSON.stringify({ result: "AI_ENTRY_DISCOVERABILITY_PASS", widths: [390, 430, 1024, 1440] }));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
