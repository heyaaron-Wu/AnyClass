"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const site = path.resolve(__dirname, "../app");
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, "http://local").pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(site, "." + pathname);
  if (!file.startsWith(site) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
  const ext = path.extname(file);
  res.writeHead(200, {"content-type": ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "text/html", "cache-control": "no-store"});
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const executablePath = [
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
  ].find(fs.existsSync);
  const browser = await chromium.launch({executablePath, headless: true, args: ["--disable-background-networking"]});
  const context = await browser.newContext({viewport: {width: 390, height: 844}, timezoneId: "Asia/Shanghai"});
  const page = await context.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  let assertions = 0;
  const check = (value, label) => { assert(value, label); assertions += 1; };
  try {
    await page.goto(base + "/timetable/");
    await page.addScriptTag({url: "/assets/timetable/ics-generator.js"});
    const seed = await page.evaluate(async () => {
      const profile = AnyClassSchoolProfileRegistry.get("school-demo");
      const monday = new Date();
      monday.setHours(0, 0, 0, 0);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const fixture = {
        key: "school-demo:2026-2027:1",
        school: {id: "school-demo", name: "Example University", sourceSystem: "zhengfang-v9"},
        semester: {academicYear: "2026-2027", term: "1"}, importedAt: "2026-09-01T00:00:00Z", fingerprint: "occurrence-synthetic",
        meetings: [
          {courseName: "Imported Course", teacher: "Teacher A", locationRaw: "Building A101", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2, 3], notes: "Source note"},
          {courseName: "Second Course", teacher: "Teacher C", locationRaw: "Building C303", weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [1, 2, 3], notes: "Second note"}
        ]
      };
      await AnyClassStorageV2.putLegacyAndMigrate(fixture, profile);
      const table = await AnyClassTimetableRepository.getActiveTimetable();
      const bundle = await AnyClassTimetableRepository.readActiveBundle();
      const data = await TimetableStorage.activeDataset();
      const first = data.__sourceEffectiveOccurrences[0];
      const manual = await AnyClassTimetableRepository.createManualCourse(table.timetableId, {title: "Manual Course", teacher: "Manual Teacher", location: "Room M1", notes: "", weekday: 3, weeks: [1, 2], startPeriod: 5, endPeriod: 6});
      return {timetableId: table.timetableId, courseId: bundle.model.courses[0].courseId, secondCourseId: bundle.model.courses[1].courseId, occurrenceId: first.occurrenceId, nominalDate: first.nominalDate, manualId: manual.courseId, fixture, monday: monday.toISOString().slice(0, 10)};
    });
    await page.evaluate(() => refreshTimetableData());
    await page.waitForSelector("#app:not([hidden])");

    const audit = () => page.evaluate(async () => {
      const data = await TimetableStorage.activeDataset();
      const bundle = await AnyClassTimetableRepository.readActiveBundle();
      const ics = await TimetableIcs.generateFromEffective(data, data.__effectiveOccurrences, data.__runtimeProfile, {now: new Date("2026-09-01T00:00:00Z")});
      return {bundle, source: data.__sourceEffectiveOccurrences.map(row => ({id: row.occurrenceId, date: row.effectiveDate, start: row.startPeriod})), final: data.__effectiveOccurrences.map(row => ({id: row.occurrenceId, date: row.effectiveDate, start: row.startPeriod, title: row.title})), uids: [...ics.ics.matchAll(/(?:^|\r\n)UID:([^\r\n]+)/g)].map(match => match[1]), events: ics.generatedEvents};
    });
    const before = await audit();
    check(before.source.length === 8 && before.final.length === 8, "imported and manual occurrences present");
    check(before.events === 8 && new Set(before.uids).size === before.uids.length, "baseline ICS events and unique UIDs");
    const sparse = await page.evaluate(async id => {
      const b = await AnyClassTimetableRepository.readActiveBundle();
      const c = b.model.courses.find(row => row.courseId === id);
      const current = (await TimetableStorage.activeDataset()).__effectiveOccurrences.find(row => row.courseId === id);
      return AnyClassTimetableRepository.saveOccurrenceOverride(current.occurrenceId, id, {...current, title: "Edited One"});
    }, seed.courseId);
    check(JSON.stringify(Object.keys(sparse.fields).sort()) === JSON.stringify(["title"]), "sparse occurrence fields");
    const edited = await audit();
    check(edited.final.find(row => row.id === seed.occurrenceId)?.title === "Edited One", "occurrence title precedence");
    check(JSON.stringify(edited.uids) === JSON.stringify(before.uids), "title edit preserves UIDs");

    const moved = await page.evaluate(async id => {
      const data = await TimetableStorage.activeDataset(), row = data.__effectiveOccurrences.find(item => item.courseId === id);
      const next = new Date(`${row.effectiveDate}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      return AnyClassTimetableRepository.saveOccurrenceOverride(row.occurrenceId, id, {...row, effectiveDate: next.toISOString().slice(0, 10), startPeriod: 2, endPeriod: 3});
    }, seed.courseId);
    check(Object.keys(moved.fields).sort().join(",") === "effectiveDate,endPeriod,startPeriod,title", "date and period sparse fields preserve prior title override");
    const movedState = await audit();
    check(movedState.final.some(row => row.id === seed.occurrenceId && row.start === 2), "moved occurrence effective period");
    check(movedState.uids.every(uid => before.uids.includes(uid)), "moved occurrence retains stable UID lineage");

    const invalid = await page.evaluate(async id => {
      const data = await TimetableStorage.activeDataset(), row = data.__effectiveOccurrences.find(item => item.courseId === id), result = {};
      for (const [key, patch] of Object.entries({title: " ", effectiveDate: "2026-02-30", startPeriod: 999, endPeriod: 1})) {
        try { await AnyClassTimetableRepository.saveOccurrenceOverride(row.occurrenceId, id, {...row, [key]:patch}); result[key] = false; } catch (error) { result[key] = /OCCURRENCE_(TITLE|DATE|PERIOD)/.test(error.message); }
      }
      return result;
    }, seed.courseId);
    check(Object.values(invalid).every(Boolean), "invalid title/date/period rejected");
    const cancelled = await page.evaluate(async id => {
      const data = await TimetableStorage.activeDataset(), row = data.__effectiveOccurrences.find(item => item.courseId === id);
      return AnyClassTimetableRepository.saveOccurrenceOverride(row.occurrenceId, id, {...row, cancelled: true});
    }, seed.courseId);
    check(cancelled.fields.cancelled === true, "cancellation sparse field");
    const afterCancel = await audit();
    check(!afterCancel.final.some(row => row.id === seed.occurrenceId) && afterCancel.events === 7, "cancelled occurrence absent from Today dataset and ICS");
    await page.goto(base + "/today/"); await page.waitForSelector("#app:not([hidden])");
    const todayModel = await page.evaluate(async date => {const data=await TimetableStorage.activeDataset();return TimetableTodayView.createTodayModel(data,data.__runtimeProfile,`${date}T08:00:00`).stats.total}, movedState.final.find(row=>row.id===seed.occurrenceId).date);
    check(todayModel===1, "Today omits cancelled occurrence on its moved effective date");
    await page.goto(base + "/timetable/"); await page.addScriptTag({url: "/assets/timetable/ics-generator.js"}); await page.waitForSelector("#app:not([hidden])");
    await page.evaluate(() => refreshTimetableData());
    await page.waitForSelector("#app:not([hidden])");
    const cancelledVisible = await page.locator("#cancelledOccurrences").isVisible();
    check(cancelledVisible, "cancelled occurrence restore panel visible");
    await page.locator("#cancelledOccurrenceList button").first().click();
    await page.waitForFunction(() => !document.querySelector("#cancelledOccurrences") || document.querySelector("#cancelledOccurrences").hidden);
    const restored = await audit();
    check(restored.final.some(row => row.id === seed.occurrenceId), "restore returns occurrence to timetable");
    check(restored.events === 8, "restore returns ICS event");

    const ownership = await page.evaluate(async state => {
      const repo = AnyClassTimetableRepository, out = {};
      try { await repo.saveOccurrenceOverride(state.occurrenceId, state.secondCourseId, {title: "Wrong owner", teacher: "", location: "", effectiveDate: state.nominalDate, startPeriod: 1, endPeriod: 1, notes: "", cancelled: false}); out.crossCourse = false; } catch (error) { out.crossCourse = error.message === "OCCURRENCE_ID_NOT_IN_COURSE"; }
      try { await repo.restoreOccurrenceField(state.occurrenceId, "missing-course", "title"); out.restore = false; } catch (error) { out.restore = error.message === "OCCURRENCE_OWNER_CONFLICT"; }
      try { await repo.restoreOccurrenceField(state.occurrenceId, state.courseId, "not-editable"); out.field = false; } catch (error) { out.field = error.message === "OCCURRENCE_FIELD_INVALID"; }
      return out;
    }, seed);
    check(ownership.crossCourse && ownership.restore && ownership.field, "ownership and invalid restore fail closed");

    const precedence=await page.evaluate(async id=>{
      const repo=AnyClassTimetableRepository,course=(await repo.readActiveBundle()).model.courses.find(item=>item.courseId===id);
      await repo.saveCourseOverride(id,{...course,location:"Building B202"});
      let row=(await TimetableStorage.activeDataset()).__effectiveOccurrences.find(item=>item.courseId===id);
      await repo.saveOccurrenceOverride(row.occurrenceId,id,{...row,location:"Building D404"});
      const c=(await TimetableStorage.activeDataset()).__effectiveOccurrences.find(item=>item.occurrenceId===row.occurrenceId).location;
      await repo.restoreOccurrenceField(row.occurrenceId,id,"location");
      const b=(await TimetableStorage.activeDataset()).__effectiveOccurrences.find(item=>item.occurrenceId===row.occurrenceId).location;
      row=(await TimetableStorage.activeDataset()).__effectiveOccurrences.find(item=>item.occurrenceId===row.occurrenceId);
      await repo.saveOccurrenceOverride(row.occurrenceId,id,{...row,title:"Temporary title"});
      await repo.saveOccurrenceOverride(row.occurrenceId,id,null);
      const empty=(await repo.readActiveBundle()).model.occurrenceOverrides.some(item=>item.occurrenceId===row.occurrenceId);
      await repo.saveCourseOverride(id,course);
      const a=(await TimetableStorage.activeDataset()).__effectiveOccurrences.find(item=>item.occurrenceId===row.occurrenceId).location;
      return {a,b,c,empty};
    },seed.secondCourseId);
    check(precedence.c==="Building D404"&&precedence.b==="Building B202"&&precedence.a==="Building C303"&&!precedence.empty,"Occurrence > Course > source precedence and empty record deletion");
    const crossWeek=await page.evaluate(async id=>{
      const repo=AnyClassTimetableRepository,source=await TimetableStorage.activeDataset(),row=source.__effectiveOccurrences.find(item=>item.courseId===id&&item.week===1),oldDate=row.effectiveDate,next=new Date(`${oldDate}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+8);
      await repo.saveOccurrenceOverride(row.occurrenceId,id,{...row,effectiveDate:next.toISOString().slice(0,10)});
      const moved=await TimetableStorage.activeDataset(),config=moved.__runtimeProfile,week1=TimetableCore.meetingsForWeek(moved,1,config),week2=TimetableCore.meetingsForWeek(moved,2,config),edited=moved.__effectiveOccurrences.find(item=>item.occurrenceId===row.occurrenceId);
      await repo.saveOccurrenceOverride(row.occurrenceId,id,null);
      return {sameId:edited.occurrenceId===row.occurrenceId,oldAbsent:!week1.some(item=>item.finalOccurrenceId===row.occurrenceId),newPresent:week2.some(item=>item.finalOccurrenceId===row.occurrenceId)};
    },seed.secondCourseId);
    check(crossWeek.sameId&&crossWeek.oldAbsent&&crossWeek.newPresent,"cross-week date move follows effective date without ID churn");

    const grouped = await page.evaluate(async state => {
      const repo = AnyClassTimetableRepository, draft=startPeriod=>({title:"Group Course",teacher:"Teacher G",location:"Building G101",notes:"",weekday:4,weeks:[1,2],startPeriod,endPeriod:startPeriod+1});
      const a=await repo.createManualCourse(state.timetableId,draft(7)),b=await repo.createManualCourse(state.timetableId,{...draft(9),attachToCourseId:a.courseId});
      const group = await repo.createSessionGroup([a.courseId,b.courseId]), data = await TimetableStorage.activeDataset(), row = data.__sourceEffectiveOccurrences.find(item => item.courseId === a.courseId), out = {group: group.groupingId};
      try { await repo.saveOccurrenceOverride(row.occurrenceId, a.courseId, {...row, title: "Grouped edit"}); out.blocked = false; } catch (error) { out.blocked = error.message === "OCCURRENCE_GROUP_REVIEW_REQUIRED"; }
      return out;
    }, seed);
    check(Boolean(grouped.group) && grouped.blocked, "grouped occurrence editing fails closed");
    await page.evaluate(groupingId => AnyClassTimetableRepository.removeSessionGroup(groupingId), grouped.group);

    const safety=await page.evaluate(async state=>{
      const repo=AnyClassTimetableRepository,before=await repo.readActiveBundle(),course=before.model.courses.find(item=>item.courseId===state.courseId),manual=before.model.courses.find(item=>item.courseId===state.manualId),data=await TimetableStorage.activeDataset(),manualRows=data.__effectiveOccurrences.filter(item=>item.courseId===state.manualId),edit=await repo.saveOccurrenceOverride(manualRows[0].occurrenceId,state.manualId,{...manualRows[0],teacher:"Changed Once"});
      const edited=await TimetableStorage.activeDataset(),manualFinal=edited.__effectiveOccurrences.filter(item=>item.courseId===state.manualId);
      let orphan=false;try{await repo.saveCourseOverride(state.courseId,{...course,weeks:[2,3]})}catch(error){orphan=error.message.includes("ORPHANED_OCCURRENCE_OVERRIDE")}
      const after=await repo.readActiveBundle();
      const other=await repo.createTimetable({label:"Other synthetic timetable"});await repo.setActiveTimetable(other.timetableId);
      let crossTable=false;try{await repo.saveOccurrenceOverride(state.occurrenceId,state.courseId,{...data.__effectiveOccurrences.find(item=>item.occurrenceId===state.occurrenceId),title:"Wrong timetable"})}catch(error){crossTable=error.message==="OCCURRENCE_OWNER_CONFLICT"}
      await repo.setActiveTimetable(state.timetableId);const deletion=await repo.deleteManualCourse(state.manualId),postDelete=await repo.readActiveBundle();
      return {manualSparse:Object.keys(edit.fields),manualChanged:manualFinal.find(item=>item.occurrenceId===manualRows[0].occurrenceId)?.teacher,manualOther:manualFinal.find(item=>item.occurrenceId===manualRows[1].occurrenceId)?.teacher,manualUnchanged:JSON.stringify(after.model.courses.find(item=>item.courseId===state.manualId))===JSON.stringify(manual),importedUnchanged:JSON.stringify(after.model.courses.find(item=>item.courseId===state.courseId))===JSON.stringify(course),orphan,crossTable,deleted:deletion.deletedOccurrenceOverrides,rowsAfter:postDelete.model.occurrenceOverrides.filter(item=>item.courseId===state.manualId).length,activeAfter:(await repo.getActiveTimetable()).timetableId};
    },seed);
    check(safety.manualSparse.join(",")==="teacher"&&safety.manualChanged==="Changed Once"&&safety.manualOther==="Manual Teacher","manual occurrence edit affects only selected week");
    check(safety.manualUnchanged&&safety.importedUnchanged,"manual and imported source Courses unchanged");
    check(safety.orphan,"removing overridden week rejects orphan without rebinding");
    check(safety.crossTable&&safety.activeAfter===seed.timetableId,"cross-timetable override rejected and active selection preserved");
    check(safety.deleted===1&&safety.rowsAfter===0,"manual Course deletion clears owned occurrence override");
    const tableDelete=await page.evaluate(async state=>{
      const repo=AnyClassTimetableRepository,table=await repo.createTimetable({label:"Disposable timetable"});await repo.setActiveTimetable(table.timetableId);
      const profile=AnyClassSchoolProfileRegistry.get("school-demo"),monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
      const manual=await repo.createManualCourse(table.timetableId,{title:"Disposable Course",teacher:"Teacher X",location:"Building X101",notes:"",weekday:1,weeks:[1],startPeriod:1,endPeriod:2},{semesterStartDate:TimetableCore.formatDate(monday),totalWeeks:2,periodTimes:profile.periodTimes});
      const row=(await TimetableStorage.activeDataset()).__effectiveOccurrences[0];await repo.saveOccurrenceOverride(row.occurrenceId,manual.courseId,{...row,notes:"One-time note"});
      await repo.setActiveTimetable(state.timetableId);await repo.deleteTimetable(table.timetableId);
      const db=await AnyClassStorageV2.openDb();const tx=db.transaction(["courses","occurrenceOverrides"],"readonly"),get=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      const course=await get(tx.objectStore("courses").get(manual.courseId)),override=await get(tx.objectStore("occurrenceOverrides").get(row.occurrenceId));db.close();return {course:!!course,override:!!override,active:(await repo.getActiveTimetable()).timetableId};
    },seed);
    check(!tableDelete.course&&!tableDelete.override&&tableDelete.active===seed.timetableId,"timetable delete removes owned override without cross-table leakage");
    await page.evaluate(()=>refreshTimetableData());await page.locator(".mobile-course").first().click();await page.locator("#editOccurrence").click();
    await page.locator("#occurrence-location").fill("Building Z909");await page.locator("#saveOccurrenceEdit").click();await page.waitForFunction(()=>document.querySelector("#courseDetailView")&&!document.querySelector("#courseDetailView").hidden);
    check((await page.locator("#dialogDetails").textContent()).includes("Building Z909"),"UI saves one-occurrence location");
    await page.locator("#editOccurrence").click();check(await page.getByRole("button",{name:"恢复本次地点原值"}).isVisible(),"field restore action visible");await page.getByRole("button",{name:"恢复本次地点原值"}).click();await page.locator("#saveOccurrenceEdit").click();await page.waitForFunction(()=>document.querySelector("#courseDetailView")&&!document.querySelector("#courseDetailView").hidden);
    check(!(await page.locator("#dialogDetails").textContent()).includes("Building Z909"),"UI restores single field without changing other fields");await page.locator("#courseDialog").evaluate(node=>node.close());

    for (const [width, height] of [[390, 844], [430, 932], [1024, 768], [1440, 900]]) for (const dark of [false, true]) {
      await page.setViewportSize({width, height}); await page.emulateMedia({colorScheme: dark ? "dark" : "light"}); await page.goto(base + "/timetable/"); await page.waitForSelector("#app:not([hidden])");
      const geometry = await page.evaluate(() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
      check(geometry.scroll <= geometry.client, `responsive no overflow ${width} ${dark}`);
      check(await page.locator(width < 700 ? ".mobile-course" : ".course-card").first().isVisible(), `responsive course visible ${width} ${dark}`);
      await page.locator(width < 700 ? ".mobile-course" : ".course-card").first().click();check(await page.locator("#editOccurrence").isVisible(),`single-occurrence entry ${width} ${dark}`);await page.locator("#editOccurrence").click();
      const dialog=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,left:document.querySelector("#courseDialog").getBoundingClientRect().left,right:document.querySelector("#courseDialog").getBoundingClientRect().right}));check(dialog.scroll<=dialog.client&&dialog.left>=-1&&dialog.right<=dialog.client+1,`occurrence editor fits ${width} ${dark}`);check(await page.locator("#occurrence-effectiveDate").isVisible()&&await page.locator("#occurrence-startPeriod").isVisible(),`date and period controls ${width} ${dark}`);await page.locator("#courseDialog").evaluate(node=>node.close());
    }
    console.log(JSON.stringify({result: "OCCURRENCE_EDITING_BROWSER_PASS", assertions}));
  } finally { await context.close(); await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
