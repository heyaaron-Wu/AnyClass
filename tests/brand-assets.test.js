"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const brandRoot = path.join(root, "app", "assets", "brand");
const manifestPath = path.join(brandRoot, "BRAND_ASSET_MANIFEST.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

assert.strictEqual(manifest.manifestVersion, 2);
assert.strictEqual(manifest.approval.status, "APPROVED");
assert.strictEqual(manifest.approval.source, "AnyClass_Logo_Package_v1.1_Centered.zip");
assert.strictEqual(
  manifest.approval.sourceSha256,
  "30fee8e76737a29d6eb6dfdc7897a8da700c203b42bb5524cd6e91017e481416"
);
assert.strictEqual(manifest.validation.packageFileCount, 21);
assert.strictEqual(manifest.assets.length, 21);

const seen = new Set();
for (const asset of manifest.assets) {
  assert(!seen.has(asset.path), `duplicate manifest path: ${asset.path}`);
  seen.add(asset.path);
  const absolute = path.resolve(root, asset.path);
  const relative = path.relative(brandRoot, absolute);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `unsafe asset path: ${asset.path}`);
  assert(fs.existsSync(absolute), `missing brand asset: ${asset.path}`);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  assert.strictEqual(actual, asset.sha256, `brand hash mismatch: ${asset.path}`);
}

assert(seen.has("app/assets/brand/AnyClass_Logo_Preview_Centered.png"));
assert.deepStrictEqual(manifest.validation.mainIconVisibleBounds.center, [511.5, 512]);

const htmlFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.name.endsWith(".html")) htmlFiles.push(absolute);
  }
};
walk(path.join(root, "app"));

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:src|href)=["'](\/assets\/brand\/[^"'?#]+)[^"']*["']/g)) {
    const referenced = path.join(root, "app", ...match[1].split("/").filter(Boolean));
    assert(fs.existsSync(referenced), `missing brand reference in ${path.relative(root, file)}: ${match[1]}`);
  }
}

console.log("BRAND_ASSETS=PASS");
console.log("BRAND_PACKAGE_SHA256=PASS");
console.log("BRAND_MANIFEST=21/21_MATCH");
console.log("BRAND_REFERENCE_SMOKE=PASS");
