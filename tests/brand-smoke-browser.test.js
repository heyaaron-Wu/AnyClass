"use strict";

const fs = require("fs");
const http = require("http");
const Module = require("module");
const path = require("path");

const runtime = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");
if (!process.env.NODE_PATH) {
  process.env.NODE_PATH = runtime;
  Module._initPaths();
}
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const site = path.join(root, "app");
const executablePath = [
  path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
].find(fs.existsSync);
const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      const relative = (pathname.endsWith("/") ? `${pathname}index.html` : pathname).replace(/^\//, "");
      const file = path.resolve(site, relative);
      if (!file.startsWith(site) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

(async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-background-networking"] });
  const routes = ["/", "/today/", "/timetable/", "/about/"];
  const viewports = [[390, 844], [430, 932], [1024, 768], [1440, 900]];
  const report = {};
  try {
    for (const [width, height] of viewports) {
      for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, timezoneId: "Asia/Shanghai" });
        for (const route of routes) {
          const page = await context.newPage();
          const errors = [];
          const failedBrandRequests = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("response", response => {
            if (response.url().includes("/assets/brand/") && response.status() !== 200) failedBrandRequests.push(`${response.status()} ${response.url()}`);
          });
          await page.goto(origin + route, { waitUntil: "networkidle" });
          const state = await page.evaluate(() => {
            const images = [...document.images].filter(image => image.currentSrc.includes("/assets/brand/"));
            return {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              images: images.map(image => ({ src: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth }))
            };
          });
          if (state.scrollWidth > state.clientWidth) throw new Error(`${width}-${theme} ${route}: horizontal overflow`);
          if (errors.length) throw new Error(`${width}-${theme} ${route}: ${errors.join(" | ")}`);
          if (failedBrandRequests.length) throw new Error(`${width}-${theme} ${route}: ${failedBrandRequests.join(" | ")}`);
          if (state.images.some(image => !image.complete || image.naturalWidth === 0)) throw new Error(`${width}-${theme} ${route}: broken brand image`);
          report[`${width}x${height}-${theme}-${route}`] = { overflow: "NONE", brandImages: state.images.length, brokenImages: 0, pageErrors: 0 };
          await page.close();
        }
        await context.close();
      }
    }
    console.log(JSON.stringify(report, null, 2));
    console.log("BRAND_RESPONSIVE_SMOKE=PASS");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
