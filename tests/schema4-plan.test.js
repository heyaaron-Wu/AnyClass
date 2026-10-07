"use strict";
const assert = require("node:assert/strict");
const engine = require("../app/assets/timetable/phaseb-engine.js");
const modelApi = require("../app/assets/timetable/course-model.js");
require("../app/assets/timetable/school-profile.js");
require("../app/assets/timetable/school-config.js");
const planner = require("../app/assets/timetable/schema4-plan.js");
const profile = {semesterStartDate:"2026-09-07",periodTimes:{1:{start:"08:00",end:"08:45"},2:{start:"08:55",end:"09:40"}},profileVersion:"demo",adapterId:"zhengfang-v9",adapterVersion:"demo"};
const dataset = term => ({key:`school-demo:2026-2027:${term}`,school:{id:"school-demo",name:"Example University",sourceSystem:"zhengfang-v9"},semester:{academicYear:"2026-2027",term},importedAt:"2026-09-01T00:00:00.000Z",fingerprint:`synthetic-${term}`,meetings:[{courseName:"Course A",teacher:"Teacher A",locationRaw:"Building A101",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2]}]});
const canonical = value => engine.canonical(value);
const rows = (terms,version) => {
  const data = terms.map(dataset), graphs = data.map(item => engine.convertV1Dataset(item,profile,item.importedAt));
  const table = {...graphs[0].timetable,activeTermId:graphs.at(-1).term.termId};
  const sourceCanonical = item => canonical({key:item.key,school:item.school,semester:item.semester,meetings:item.meetings,fingerprint:item.fingerprint || null});
  const result = {timetables:data,v2Timetables:[table],terms:graphs.map(item => item.term),baseMeetings:graphs.flatMap(item => item.baseMeetings),v1Snapshots:data.map(item => ({snapshotId:`v1:${item.key}`,sourceKey:item.key,dataset:item})),v2Migrations:data.map(item => ({migrationId:`v1-to-v2:${item.key}`,sourceCanonical:sourceCanonical(item),meetingCount:item.meetings.length,status:"VERIFIED"})),importSnapshots:[],courses:[],courseOverrides:[],occurrenceOverrides:[],scheduleOverrides:[],schema3Migrations:[]};
  if (version === 3) for (let i=0;i<data.length;i++) {
    const built = modelApi.build(data[i],graphs[i]);
    result.importSnapshots.push(built.snapshot);
    result.courses.push(...built.courses);
  }
  return {result,data,graphs};
};
assert.equal(planner.plan({timetables:[],v2Timetables:[],terms:[],baseMeetings:[],v1Snapshots:[],v2Migrations:[],importSnapshots:[],courses:[],courseOverrides:[],occurrenceOverrides:[],scheduleOverrides:[],schema3Migrations:[]},0).activeTimetableId,null);
{
  const legacyOnly=planner.plan({timetables:[dataset("1")],v2Timetables:[],terms:[],baseMeetings:[],v1Snapshots:[],v2Migrations:[],importSnapshots:[],courses:[],courseOverrides:[],occurrenceOverrides:[],scheduleOverrides:[],schema3Migrations:[]},2);
  assert.equal(legacyOnly.timetables.length,1);
  assert.equal(legacyOnly.baseMeetings.length,1);
  assert.equal(legacyOnly.courses.length,1);
}
for (const version of [2,3]) {
  for (const count of [1,2]) {
    const {result,data,graphs}=rows(count===1?["1"]:["1","2"],version),plan=planner.plan(result,version);
    assert.equal(plan.timetables.length,count);
    assert.equal(plan.terms.length,count);
    assert.equal(plan.courses.length,count);
    assert.equal(plan.importSnapshots.length,count);
    assert.equal(new Set(plan.timetables.map(item=>item.routingKey)).size,count);
    for (let i=0;i<count;i++) {
      assert.equal(plan.courses[i].sourceMeetingId,graphs[i].baseMeetings[0].baseMeetingId);
      assert.equal(plan.courses[i].courseId,modelApi.build(data[i],graphs[i]).courses[0].courseId);
      assert.equal(plan.courses[i].sourceRaw.locationRaw,"Building A101");
    }
    assert.equal(plan.activeTimetableId,plan.terms.at(-1).timetableId);
  }
}
{
  const {result}=rows(["1"],3);
  result.courses[0].sourceMeetingId="missing";
  assert.throws(()=>planner.plan(result,3),/SCHEMA4_/);
}
{
  const {result}=rows(["1"],2);
  result.scheduleOverrides.push({scheduleOverrideId:"bad"});
  assert.throws(()=>planner.plan(result,2),/SCHEDULE_OVERRIDE_OWNER_AMBIGUOUS/);
}
{
  const {result}=rows(["1","2"],2);
  result.scheduleOverrides.push({scheduleOverrideId:"ambiguous",timetableId:result.v2Timetables[0].timetableId});
  assert.throws(()=>planner.plan(result,2),/SCHEDULE_OVERRIDE_MULTI_TERM_AMBIGUOUS/);
}
console.log(JSON.stringify({empty:"PASS",schema2:"PASS",schema3:"PASS",historicalTerms:"PASS",identity:"PASS",sourceRaw:"PASS",ambiguous:"FAIL_CLOSED",ownerlessScheduleOverride:"FAIL_CLOSED"}));
