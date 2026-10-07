"use strict";
const assert = require("node:assert/strict");
const engine = require("../app/assets/timetable/phaseb-engine.js");
const model = require("../app/assets/timetable/course-model.js");
const resolver = require("../app/assets/timetable/course-resolver.js");

const config = {semesterStartDate:"2026-09-07",periodTimes:{1:{start:"08:00",end:"08:45"},2:{start:"08:55",end:"09:40"}},profileVersion:"test",adapterId:"zhengfang-v9",adapterVersion:"test"};
const dataset = {key:"school:test:2026-2027:1",school:{id:"test",name:"测试学校",sourceSystem:"zhengfang-v9"},semester:{academicYear:"2026-2027",term:"1"},importedAt:"2026-09-01T00:00:00.000Z",fingerprint:"fixture",meetings:[
  {courseName:"同名课程",teacher:"教师甲",locationRaw:"原始地点 A  ",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2]},
  {courseName:"同名课程",teacher:"教师乙",locationRaw:"原始地点 B",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2]}
]};
const graph = engine.convertV1Dataset(dataset,config,"2026-09-01T00:00:00.000Z");
const first = model.build(dataset,graph), second = model.build(structuredClone(dataset),engine.convertV1Dataset(structuredClone(dataset),config,"2026-09-02T00:00:00.000Z"));
assert.equal(first.schemaVersion,3);
assert.equal(first.courses.length,2);
assert.equal(new Set(first.courses.map(item=>item.courseId)).size,2);
assert.deepEqual(first.courses.map(item=>item.courseId),second.courses.map(item=>item.courseId));
assert.equal(first.courses[0].location,"原始地点 A  ");
assert.equal(first.courses[0].sourceRaw.locationRaw,"原始地点 A  ");
assert.equal(first.courses[0].campus,null);
const occurrence={occurrenceId:"occurrence:test",courseId:first.courses[0].courseId,effectiveDate:"2026-09-07",location:"source"};
const effective=resolver.resolveOccurrence({course:first.courses[0],occurrence,courseOverride:{courseId:first.courses[0].courseId,fields:{location:"course override",teacher:"override teacher"}},occurrenceOverride:{occurrenceId:"occurrence:test",courseId:first.courses[0].courseId,fields:{location:"occurrence override"}}});
assert.equal(effective.location,"occurrence override");
assert.equal(effective.teacher,"override teacher");
assert.equal(first.courses[0].location,"原始地点 A  ");
console.log(JSON.stringify({schemaVersion:3,courses:2,stableIds:"PASS",similarCoursesDistinct:"PASS",sourceRaw:"PASS",precedence:"PASS",result:"PASS"},null,2));
