"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {randomUUID} = require("node:crypto");

const repository = path.resolve(__dirname, "..");
const configured = process.env.ANYCLASS_LOCAL_ARTIFACT_ROOT;
const preferred = path.resolve(repository, "..", "..", "anyclass-local-artifacts");
const root = path.resolve(configured || (fs.existsSync(preferred) ? preferred : path.join(os.tmpdir(), "anyclass-local-artifacts")));

function outsideRepository(target) {
  const relative = path.relative(repository, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative) ? false : true;
}

function resolvedTarget(target) {
  let existing = target;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  return path.resolve(fs.realpathSync(existing), path.relative(existing, target));
}

if (!outsideRepository(root) || !outsideRepository(resolvedTarget(root))) {
  throw new Error("ANYCLASS_LOCAL_ARTIFACT_ROOT must be outside the repository");
}

const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid + "-" + randomUUID().slice(0, 8);

function evidenceDirectory(suite) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(suite)) throw new Error("Invalid evidence suite name");
  const directory = path.join(root, suite, runId);
  fs.mkdirSync(directory, {recursive: true});
  return directory;
}

module.exports = {evidenceDirectory, root};
