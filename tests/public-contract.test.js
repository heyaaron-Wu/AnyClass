"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const readme = read("README.md");
assert(readme.includes("https://anyclass.heyaaron.asia/"));
assert(/正方教务 V9[^\n]*已验证/.test(readme));
assert(!readme.includes("广东邮电职业技术学院"));

const exportPage = read("app/export/index.html");
for (const text of ["导入 Apple 日历", "Safari 打开日历导入界面", "全部加入", "无法直接导入？", "使用快捷指令导入", "从“文件”App 打开已下载的 .ics 文件", "避免重复课程"]) assert(exportPage.includes(text), text);
assert(!/iOS 26|保持拖动|拖入日历/.test(exportPage));
assert(exportPage.includes("https://www.icloud.com/shortcuts/de98e25371614480bc8bd7871415e050"));

const publicDocs = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "PRIVACY.md", "CHANGELOG.md"].map(read).join("\n");
assert(!/C:\\Users\\|\/home\/admin\/|\/var\/www\//.test(publicDocs));
const sensitivePatterns = [/password\s*=/i, new RegExp("BEGIN " + "PRIVATE KEY", "i"), new RegExp("AK" + "IA[0-9A-Z]{16}")];
for (const pattern of sensitivePatterns) assert(!pattern.test(publicDocs));
console.log("PUBLIC_CONTRACT=PASS");
