"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {evidenceDirectory, root} = require("./local-artifacts");

const repository = path.resolve(__dirname, "..");
const inside = target => target === repository || target.startsWith(repository + path.sep);
const directory = evidenceDirectory("boundary-test");
assert(!inside(root) && !inside(directory));
assert(fs.statSync(directory).isDirectory());
assert(!fs.existsSync(path.join(repository, "outputs")));

const child = spawnSync(process.execPath, ["-e", "require('./tests/local-artifacts').evidenceDirectory('invalid-root-check')"], {
  cwd: repository,
  env: {...process.env, ANYCLASS_LOCAL_ARTIFACT_ROOT: path.join(repository, "outputs")},
  encoding: "utf8"
});
assert.notEqual(child.status, 0, "repository-local override must be rejected");
assert(!fs.existsSync(path.join(repository, "outputs")));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "anyclass-artifact-boundary-"));
const accepted = spawnSync(process.execPath, ["-e", "console.log(require('./tests/local-artifacts').evidenceDirectory('portable-check'))"], {
  cwd: repository,
  env: {...process.env, ANYCLASS_LOCAL_ARTIFACT_ROOT: tempRoot},
  encoding: "utf8"
});
assert.equal(accepted.status, 0);
assert(accepted.stdout.trim().startsWith(tempRoot + path.sep));
assert(fs.statSync(accepted.stdout.trim()).isDirectory());
console.log(JSON.stringify({result: "LOCAL_ARTIFACT_BOUNDARY_PASS", repositoryOutputsAbsent: true, externalRoot: root}));
