"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {chromium} = require("playwright");
const root = path.resolve(__dirname, "../app");
const out = require("./local-artifacts").evidenceDirectory("about-github");
const executablePath = [path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"), path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")].find(fs.existsSync);
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, "http://local").pathname);
  if (name.endsWith("/")) name += "index.html";
  const file = path.resolve(root, "." + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  const contentType = file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : file.endsWith(".ico") ? "image/x-icon" : "text/html";
  res.writeHead(200, {"content-type": contentType, "cache-control": "no-store"});
  res.end(fs.readFileSync(file));
});
(async () => {
  fs.mkdirSync(out, {recursive: true});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath, headless: true});
  const results = [];
  try {
    for (const [width, theme] of [[390, "light"], [390, "dark"], [430, "light"], [1024, "light"], [1440, "light"], [1440, "dark"]]) {
      const context = await browser.newContext({viewport: {width, height: width < 700 ? 844 : 900}, colorScheme: theme, isMobile: width < 700, hasTouch: width < 700});
      await context.route("https://github.com/heyaaron-Wu/AnyClass", route => route.fulfill({status: 200, contentType: "text/html", body: "<title>Synthetic GitHub destination</title>"}));
      const page = await context.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/about/`);
      const link = page.locator("#aboutGithubLink");
      assert(await link.isVisible(), `GitHub entry absent at ${width} ${theme}`);
      assert.equal(await link.getAttribute("href"), "https://github.com/heyaaron-Wu/AnyClass");
      assert.equal(await link.getAttribute("target"), "_blank");
      assert.deepEqual(new Set((await link.getAttribute("rel")).split(/\s+/)), new Set(["noopener", "noreferrer"]));
      assert.match(await link.innerText(), /GitHub \/ 开源项目/);
      assert.match(await link.innerText(), /查看源码、版本发布与项目进展/);
      assert.match(await link.innerText(), /github\.com\/heyaaron-Wu\/AnyClass/);
      const geometry = await page.evaluate(() => {
        const node = document.getElementById("aboutGithubLink"), rect = node.getBoundingClientRect();
        return {overflow: document.documentElement.scrollWidth > innerWidth + 1, left: rect.left, right: rect.right, width: rect.width, height: rect.height, color: getComputedStyle(node).color, card: getComputedStyle(document.querySelector(".about-version")).backgroundColor, text: document.body.innerText, external: [...document.querySelectorAll('a[href^="http"]')].map(item => item.href)};
      });
      assert(!geometry.overflow && geometry.left >= 0 && geometry.right <= width + 1, `About overflows at ${width} ${theme}`);
      assert(geometry.height >= 44, `GitHub touch target too small at ${width} ${theme}`);
      assert.deepEqual(geometry.external, ["https://github.com/heyaaron-Wu/AnyClass"]);
      assert(!/(?:Example Hidden Academy|Internal Example Institute|[A-Z]:\\Users\\|\/opt\/prism|PRIVATE KEY)/i.test(geometry.text), "About text has no internal fixture markers");
      await page.keyboard.press("Tab");
      let reached = false;
      for (let i = 0; i < 20; i++) {
        if (await page.evaluate(() => document.activeElement?.id === "aboutGithubLink")) { reached = true; break; }
        await page.keyboard.press("Tab");
      }
      assert(reached, `GitHub link not reachable by keyboard at ${width} ${theme}`);
      const outline = await link.evaluate(node => getComputedStyle(node).outlineWidth);
      assert.notEqual(outline, "0px", `GitHub focus not visible at ${width} ${theme}`);
      await page.locator(".settings-page-heading h1").click();
      await page.screenshot({path: path.join(out, `about-${width}-${theme}.png`), fullPage: true});
      if (width === 390 && theme === "light") {
        const [popup] = await Promise.all([page.waitForEvent("popup"), link.press("Enter")]);
        assert.equal(popup.url(), "https://github.com/heyaaron-Wu/AnyClass");
        assert.equal(page.url(), `${base}/about/`);
        await popup.close();
      }
      assert.deepEqual(errors, [], `About page errors at ${width} ${theme}`);
      results.push({width, theme, height: geometry.height, color: geometry.color, card: geometry.card, result: "PASS"});
      await context.close();
    }
    console.log(JSON.stringify({result: "PASS", results, screenshots: out}));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
