"use strict";

const assert = require("node:assert/strict");
const normalized = require("../app/assets/timetable/normalized-import.js");

const profile = {id:"school-demo", name:"Example University", adapterId:"zhengfang-v9"};
const adapter = {id:"zhengfang-v9"};
const result = normalized.create({
  profile,
  adapter,
  semester:{academicYear:"2026-2027",term:"1"},
  meetings:[{courseName:"Course A",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2],privateSourceField:"discarded"}],
  source:"file"
});

assert.equal(result.schemaVersion,1);
assert.equal(result.key,"school-demo::2026-2027::1");
assert.equal(result.school.id,"school-demo");
assert.equal(result.meetings.length,1);
assert.equal(Object.hasOwn(result,"privateSourceField"),false);
assert.throws(()=>normalized.create({...result,profile,adapter:{id:"other"}}),/NORMALIZED_IMPORT_SOURCE_INVALID/);
console.log(JSON.stringify({bookmarklet:"NORMALIZED",file:"NORMALIZED",sourceSpecificRootFields:"DISCARDED",result:"PASS"},null,2));
