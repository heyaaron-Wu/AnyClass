"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const site = path.join(root, "app");
const read = relative => fs.readFileSync(path.join(site, relative), "utf8");

const publicHtml = [];
const collectHtml = directory => {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(absolute);
    else if (entry.name === "index.html") publicHtml.push(fs.readFileSync(absolute, "utf8"));
  }
};
collectHtml(site);
assert.equal((publicHtml.join("\n").match(/Example University/g) || []).length, 0, "public static HTML school name");

const mobile = read("import-mobile/index.html");
for (const obsolete of [
  "高级设置 / 手动安装",
  "手动配置",
  "在共享表单中显示",
  "在网页上运行 JavaScript",
  "JSResult",
  "meetingCount",
  "复制手动安装脚本",
  "ios-shortcut-parser-shortcut.txt",
  "0 KB"
]) assert(!mobile.includes(obsolete), `obsolete mobile copy: ${obsolete}`);
for (const required of [
  "https://www.icloud.com/shortcuts/de98e25371614480bc8bd7871415e050",
  "已有文件，直接导入",
  "课程数据只在当前设备处理，不会上传服务器",
  "仍需手动选择一次文件"
]) assert(mobile.includes(required), `required mobile flow: ${required}`);

const importFile = read("import-file/index.html");
for (const value of ['"id": "school-id"', '"name": "学校名称"']) assert(importFile.includes(value), `generic schema: ${value}`);
assert(!importFile.includes('"id": "demo"'), "public schema profile id");

const importPage = read("import/index.html");
for (const obsolete of [
  "高级诊断说明",
  "等待从教务系统读取课表",
  "书签脚本已复制。现在新建书签并粘贴到网址栏。",
  "如果书签未运行"
]) assert(!importPage.includes(obsolete), `obsolete desktop import copy: ${obsolete}`);
for (const required of [
  "复制“导入 AnyClass 课表”书签",
  "✓ 已复制",
  "课表已读取",
  "重新选择导入方式",
  "showInitial(false)",
  "friendlyImportError"
]) assert(importPage.includes(required), `desktop import flow: ${required}`);
assert(importPage.includes('BOOKMARKLET_VERSION="3.0.0"'), "bookmarklet version unchanged");
assert(importPage.includes('BOOKMARKLET_ID="anyclass-import"'), "bookmarklet id unchanged");

const shell = read("assets/timetable/product-shell.js");
for (const contract of [
  'const PRIMARY_PAGES = new Set(["today", "timetable", "import", "import-mobile", "import-file"])',
  'const PRIMARY_ACTION_PAGES = new Set(["today", "timetable"])',
  '[["today", "/", "今天"], ["timetable", "/timetable/", "课表"], ["settings", "/settings/", "设置"]]',
  'href="/import/">导入</a>',
  'if (dock) document.body.append(dock)'
]) assert(shell.includes(contract), `shell contract: ${contract}`);
assert(!shell.includes('href="/settings/">更多</a>'), "obsolete global More action");
assert(!shell.includes('["import", "/import/", "导入"]'), "Import must not be a Dock item");

const shellPages = [
  "index.html", "today/index.html", "timetable/index.html", "import/index.html",
  "import-mobile/index.html", "import-file/index.html", "settings/index.html",
  "settings/personalization/index.html", "settings/timetable/index.html",
  "compatibility/index.html", "about/index.html", "local-status/index.html", "export/index.html"
];
for (const page of shellPages) {
  const html = read(page);
  assert(html.includes('product-shell.js?v=import-nav-cleanup-20260918'), `${page} versioned shell JS`);
  assert(/product-shell\.css\?v=(?:(?:import-nav-cleanup|v011-mobile-period-today)-20260918|v011-import-flow-20260919)/.test(html), `${page} versioned shell CSS`);
}

for (const page of ["index.html", "today/index.html"]) {
  const html = read(page);
  assert(!html.includes("today-secondary-action"), `${page} obsolete Today export action`);
  assert(!html.includes(">导出日历</a>"), `${page} obsolete Today export link`);
  assert(html.includes("product-shell.css?v=v011-mobile-period-today-20260918"), `${page} refreshed CSS marker`);
}
const periodSettings = read("settings/timetable/index.html");
assert(periodSettings.includes("product-shell.css?v=v011-mobile-period-today-20260918"), "period settings refreshed CSS marker");
assert(!read("assets/timetable/product-shell.css").includes(".today-secondary-action"), "unused Today action CSS");

const docs = ["docs", "public-release-candidate/docs"]
  .flatMap(relative => {
    const directory = path.join(root, relative);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, {recursive: true})
      .filter(file => /\.(?:md|html)$/i.test(file))
      .map(file => fs.readFileSync(path.join(directory, file), "utf8"));
  }).join("\n");
assert(!docs.includes("Example University"), "public documentation school marketing");

console.log(JSON.stringify({
  publicStaticSchoolNames: 0,
  manualInstall: "REMOVED",
  dock: ["今天", "课表", "设置"],
  primaryHeaderAction: "导入",
  settingsContextDock: "DISABLED",
  result: "PUBLIC_CONTRACT_PASS"
}, null, 2));
