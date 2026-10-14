"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../app");
const evidenceDir = path.resolve(
  process.env.ANYCLASS_UNIFIED_SHORTCUT_VISUAL_EVIDENCE_DIR ||
    fs.mkdtempSync(path.join(os.tmpdir(), "anyclass-unified-shortcut-visual-")),
);
const executablePath = process.env.ANYCLASS_CHROME_EXECUTABLE;
const productionOrigin = "https://anyclass.heyaaron.asia";
const betaOrigin = "https://beta.anyclass.heyaaron.asia";
const officialICloud = "https://www.icloud.com/shortcuts/89145db4f66e409fbaa5fd3e5257b124";
const cases = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 900 },
];

fs.mkdirSync(evidenceDir, { recursive: true });
let assertions = 0;
const measurements = [];
const check = (value, message) => {
  assert(value, message);
  assertions += 1;
};
const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertions += 1;
};

async function appRoute(route) {
  const url = new URL(route.request().url());
  if (url.hostname === "www.icloud.com" || url.hostname === "github.com") {
    return route.abort();
  }
  let relative = decodeURIComponent(url.pathname);
  if (relative.endsWith("/")) relative += "index.html";
  let file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
    return route.fulfill({ status: 404, body: "not found" });
  }
  if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  const contentType = file.endsWith(".js")
    ? "application/javascript"
    : file.endsWith(".css")
      ? "text/css"
      : file.endsWith(".json")
        ? "application/json"
        : file.endsWith(".svg")
          ? "image/svg+xml"
          : "text/html";
  return route.fulfill({ status: 200, contentType, body: fs.readFileSync(file) });
}

async function contrast(page, selector, label) {
  const result = await page.locator(selector).first().evaluate((element) => {
    const parse = (value) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
    };
    const opaqueBackground = (node) => {
      for (let current = node; current; current = current.parentElement) {
        const parsed = parse(getComputedStyle(current).backgroundColor);
        if (parsed && parsed[3] === 1) return parsed.slice(0, 3);
      }
      const rootColor = parse(getComputedStyle(document.documentElement).backgroundColor);
      return rootColor ? rootColor.slice(0, 3) : [255, 255, 255];
    };
    const foreground = parse(getComputedStyle(element).color).slice(0, 3);
    const background = opaqueBackground(element);
    const luminance = (rgb) => {
      const linear = rgb.map((component) => {
        const channel = component / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const light = luminance(foreground);
    const dark = luminance(background);
    const ratio = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    return { foreground, background, ratio: Number(ratio.toFixed(2)) };
  });
  measurements.push({ label, ...result });
  check(result.ratio >= 4.5, `${label}: text contrast ${result.ratio}:1 is at least 4.5:1`);
}

async function commonLayoutChecks(page, label) {
  equal(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    false,
    `${label}: no horizontal overflow`,
  );
}

async function touchTarget(page, selector, label) {
  const box = await page.locator(selector).first().boundingBox();
  check(Boolean(box), `${label}: target is rendered`);
  check(box.height >= 44 && box.width >= 44, `${label}: target is at least 44 by 44 CSS pixels`);
}

async function keyboardFocus(page, selector, label) {
  await page.locator(selector).first().focus();
  const focus = await page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      active: document.activeElement === element,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  check(focus.active, `${label}: receives keyboard focus`);
  check(focus.outlineStyle !== "none" && Number.parseFloat(focus.outlineWidth) >= 2, `${label}: visible focus outline`);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    for (const viewport of cases) {
      for (const theme of ["light", "dark"]) {
        const label = `${viewport.name}-${theme}`;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: theme,
          reducedMotion: viewport.width <= 430 ? "reduce" : "no-preference",
          serviceWorkers: "block",
        });
        let iCloudRequests = 0;
        await context.route("**/*", (route) => {
          if (new URL(route.request().url()).hostname === "www.icloud.com") {
            iCloudRequests += 1;
            return route.abort();
          }
          return appRoute(route);
        });

        const importPage = await context.newPage();
        await importPage.goto(`${betaOrigin}/import/?method=mobile&visualAudit=1`);
        await commonLayoutChecks(importPage, `import/${label}`);
        equal(await importPage.locator("#addImportShortcut").getAttribute("href"), officialICloud, `import/${label}: exact iCloud target`);
        await touchTarget(importPage, "#addImportShortcut", `import/${label}`);
        await contrast(importPage, "#addImportShortcut", `import/${label} primary action`);
        await importPage.screenshot({
          path: path.join(evidenceDir, `import-${label}.png`),
          fullPage: true,
          animations: "disabled",
        });
        equal(iCloudRequests, 0, `import/${label}: no automatic iCloud request`);

        const aboutPage = await context.newPage();
        await aboutPage.goto(`${betaOrigin}/about/?visualAudit=1`);
        await commonLayoutChecks(aboutPage, `about/${label}`);
        await touchTarget(aboutPage, ".about-shortcut-action", `about/${label}`);
        await contrast(aboutPage, ".about-shortcut-version", `about/${label} version`);
        await contrast(aboutPage, ".about-shortcut-copy > p:last-child", `about/${label} description`);
        await contrast(aboutPage, ".about-shortcut-action", `about/${label} action`);
        await keyboardFocus(aboutPage, ".about-shortcut-action", `about/${label} action`);
        await aboutPage.screenshot({
          path: path.join(evidenceDir, `about-${label}.png`),
          fullPage: true,
          animations: "disabled",
        });

        const installPage = await context.newPage();
        await installPage.goto(`${productionOrigin}/shortcuts/install?visualAudit=1`);
        await commonLayoutChecks(installPage, `install/${label}`);
        equal(await installPage.locator("script").count(), 0, `install/${label}: JavaScript-free`);
        equal(await installPage.locator('meta[http-equiv="refresh" i]').count(), 0, `install/${label}: no redirect`);
        equal(await installPage.locator(".primary-action").getAttribute("href"), officialICloud, `install/${label}: exact iCloud target`);
        await touchTarget(installPage, ".primary-action", `install/${label}`);
        await contrast(installPage, ".summary", `install/${label} summary`);
        await contrast(installPage, ".primary-action", `install/${label} action`);
        await contrast(installPage, ".release-entry li", `install/${label} changelog`);
        await keyboardFocus(installPage, ".primary-action", `install/${label} action`);
        await installPage.screenshot({
          path: path.join(evidenceDir, `install-${label}.png`),
          fullPage: true,
          animations: "disabled",
        });
        equal(iCloudRequests, 0, `install/${label}: no automatic iCloud request`);
        await context.close();
      }
    }
    console.log(JSON.stringify({
      result: "UNIFIED_SHORTCUT_VISUAL_BROWSER_PASS",
      assertions,
      evidenceDir,
      matrix: cases.map(({ name, width, height }) => ({ name, width, height, themes: ["light", "dark"] })),
      measurements,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
