"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = path.resolve(__dirname, "../app");
const pages = [
  "index.html", "today/index.html", "timetable/index.html", "import/index.html",
  "import-mobile/index.html", "import-file/index.html", "settings/index.html",
  "settings/personalization/index.html", "settings/timetable/index.html",
  "compatibility/index.html", "about/index.html", "local-status/index.html", "export/index.html",
];
const html = pages.map((file) => fs.readFileSync(path.join(app, file), "utf8"));
const mobile = fs.readFileSync(path.join(app, "import-mobile/index.html"), "utf8");
const importFile = fs.readFileSync(path.join(app, "import-file/index.html"), "utf8");
const shell = fs.readFileSync(path.join(app, "assets/timetable/product-shell.js"), "utf8");

assert.equal(html.some((text) => text.includes("广东邮电职业技术学院")), false);
assert.equal(mobile.includes("高级设置 / 手动安装"), false);
assert.equal(mobile.includes("手动配置"), false);
assert.equal(mobile.includes("复制手动安装脚本"), false);
assert.match(importFile, /"id": "school-id"/);
assert.match(importFile, /"name": "学校名称"/);
assert.match(shell, /\["today", "\/", "今天"\], \["timetable", "\/timetable\/", "课表"\], \["settings", "\/settings\/", "设置"\]/);
assert.match(shell, /PRIMARY_ACTION_PAGES\.has\(page\).*\/import\/.*导入/);
assert.match(shell, /const dock = primaryContext \? document\.createElement\("nav"\) : null/);
for (const text of html) {
  assert.match(text, /product-shell\.js\?v=import-nav-cleanup-20260918/);
  assert.match(text, /product-shell\.css\?v=import-nav-cleanup-20260918/);
}
console.log("PUBLIC_CONTRACT=PASS");
