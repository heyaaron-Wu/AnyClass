"use strict";
const assert = require("node:assert/strict");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const {chromium} = require("playwright");
const acknowledgeConflicts = async page => {if(await page.locator("#fileConflictReview").isVisible()){await page.locator("#fileConflictDetails > summary").click();assert.match(await page.locator("#fileConflictItems").innerText(),/重叠/);for(const group of await page.locator("#fileConflictItems .file-conflict-group").all())await group.locator("summary").click();for(const button of await page.locator("#fileConflictItems button").filter({hasText:"确认这是真实冲突，保留两者"}).all())await button.click();await page.locator("#fileConflictConfirm").check();await page.locator("#fileConflictDetails > summary").click()}};
const visualOutput = process.env.ANYCLASS_VISUAL_OUTPUT ? require("./local-artifacts").evidenceDirectory("legacy-file-compat") : null;
const site = path.resolve(__dirname,"../app");
const server = http.createServer((req,res) => {
  let name = decodeURIComponent(new URL(req.url,"http://local").pathname);
  if (name.endsWith("/")) name += "index.html";
  const file = path.resolve(site,"."+name);
  if (!file.startsWith(site) || !fs.existsSync(file)) {res.writeHead(404);res.end("not found");return;}
  res.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html","cache-control":"no-store"});
  res.end(fs.readFileSync(file));
});
const fixture = id => ({schemaVersion:1,school:{id,name:id === "school-demo" ? "Example University" : "Example Other University"},semester:{academicYear:"2026-2027",term:"1"},meetings:Array.from({length:29},(_,i)=>({courseName:`Course ${i+1}`,weekday:i%5+1,startPeriod:1,endPeriod:2,weeks:[1,2],teacher:"Teacher A",locationRaw:"Building A101"}))});
const denseFixture = () => ({schemaVersion:1,school:{id:"school-layout-demo",name:"Example University"},semester:{academicYear:"2026-2027",term:"1"},meetings:Array.from({length:29},(_,i)=>({courseName:i===0?"示例课程名称很长需要在小屏幕安全换行并保持阅读顺序":`示例课程 ${i%11+1}`,weekday:i%7+1,startPeriod:i===0?3:i%8+1,endPeriod:i===0?10:Math.min(10,i%8+2),weeks:i%3===0?[1,3,5,7,9]:i%3===1?[2,4,6,8,10]:[11,12,13],teacher:"Teacher A",locationRaw:i===0?"示例教学楼东侧综合实验区域 A101，需要在窄屏幕自然换行":"Building A101"}))});
const executablePath = [path.join(process.env.LOCALAPPDATA || "","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"] || "","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({executablePath,headless:true,args:["--disable-background-networking"]});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/import/?method=file`);
    const validation=await page.evaluate(([known,unknown])=>{
      const parse=value=>AnyClassTimetableFile.validateAndNormalize(value);
      const a=parse(known),b=parse(unknown);
      let malformed=false,invalidMeeting=false;
      try {parse({...unknown,semester:{academicYear:"invalid",term:"1"}});} catch(_) {malformed=true;}
      try {parse({...unknown,meetings:[{...unknown.meetings[0],weekday:8}]});} catch(_) {invalidMeeting=true;}
      return {known:a.school,unknown:b.school,unknownCount:b.meetings.length,malformed,invalidMeeting,profile:AnyClassSchoolProfileRegistry.get(unknown.school.id),origins:AnyClassSchoolProfileRegistry.matchOrigin("https://unknown.example.edu").length};
    },[fixture("school-demo"),fixture("school-other")]);
    assert.equal(validation.known.sourceSystem,"file");
    assert.equal(validation.unknown.sourceSystem,"file");
    assert.equal(validation.unknownCount,29);
    assert.equal(validation.profile,null);
    assert.equal(validation.origins,0);
    assert(validation.malformed && validation.invalidMeeting);
    const defaultAudit=await page.evaluate(()=>{const times=AnyClassDefaultPeriodTimes.clone(),copy=AnyClassDefaultPeriodTimes.clone(),beyond=AnyClassTimetableFileStorage.validateCalendarContext({meetings:[{endPeriod:12}]},{semesterStartDate:"2026-08-31",timezone:"Asia/Shanghai",periodTimes:times});copy[1].start="09:00";return {count:Object.keys(times).length,first:times[1],midday:times[5],evening:times[9],last:times[11],cloneIndependent:copy[1].start!==times[1].start,beyondStatus:beyond.timingStatus}});
    assert.deepEqual(defaultAudit,{count:11,first:{start:"08:00",end:"08:45"},midday:{start:"14:00",end:"14:45"},evening:{start:"18:30",end:"19:15"},last:{start:"20:20",end:"21:05"},cloneIndependent:true,beyondStatus:"INCOMPLETE"});
    const file=fixture("school-other");
    await page.locator("#fileInput").setInputFiles({name:"synthetic.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(file))});
    await page.waitForSelector("#filePreview:not([hidden])",{timeout:5000}).catch(async error=>{throw new Error(`${error.message}; pageErrors=${JSON.stringify(pageErrors)}; fileMessage=${await page.locator("#fileMessage").innerText()}`)});
    assert(await page.locator("#fileCalendarContext").isVisible());
    assert.equal(await page.locator("#fileTimeLater").count(),0);
    assert(await page.locator("#fileDateDisplay").isHidden());
    assert.equal(await page.locator("#fileDateDisplay").getAttribute("aria-hidden"),"true");
    assert.equal(await page.locator("#fileDateDisplay").getAttribute("data-empty"),"true");
    assert.equal(await page.locator("#fileSemesterStart").getAttribute("type"),"date");
    await page.locator(".file-date-control").click();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),"fileSemesterStart");
    assert.equal(await page.locator("#fileSemesterStart").evaluate(input=>getComputedStyle(input).opacity),"1");
    const dateFocus=await page.evaluate(()=>({shell:getComputedStyle(document.querySelector(".file-date-control")).outlineStyle,input:getComputedStyle(document.querySelector("#fileSemesterStart")).outlineStyle}));
    assert.equal(dateFocus.shell,"solid");assert.equal(dateFocus.input,"none");
    assert(await page.locator("#fileSave").isDisabled());
    assert.equal(await page.locator("#fileSubmitMessage").isHidden(),true);
    assert.equal(await page.locator("#fileSemesterStart").getAttribute("aria-invalid"),null);
    assert.equal(await page.evaluate(()=>AnyClassTimetableRepository.listTimetables().then(rows=>rows.length)),0);
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    assert(await page.locator("#fileDateDisplay").isHidden());
    assert.equal(await page.locator("#fileDateDisplay").getAttribute("data-empty"),"false");
    assert.equal(await page.locator("#fileSemesterStart").inputValue(),"2026-08-31");
    assert.match(await page.locator("#fileTimezoneInfo").innerText(),/跟随设备/);
    assert(await page.locator("#fileTimeEditor").isHidden());
    assert.match(await page.locator("#filePeriodHint").innerText(),/默认作息/);
    assert.equal(await page.locator("#fileTimeNow").innerText(),"修改");
    await acknowledgeConflicts(page);await page.locator("#fileSave").click();
    await page.waitForFunction(()=>/已保存|已更新|没有变化/.test(document.querySelector("#fileSubmitMessage").textContent),null,{timeout:5000}).catch(async error=>{throw Error(`${error.message}; submit=${await page.locator("#fileSubmitMessage").innerText()}; review=${await page.locator("#reimportReview").isVisible()}; file=${await page.locator("#fileMessage").innerText()}`)});
    for (const name of ["storage","ics-generator"]) await page.addScriptTag({url:`/assets/timetable/${name}.js`});
    const stored=await page.evaluate(async()=>{
      const db=await AnyClassStorageV2.openDb(),version=db.version;db.close();
      const bundle=await AnyClassTimetableRepository.readActiveBundle();
      const dataset=await TimetableStorage.activeDataset();
      const ics=await TimetableIcs.generateFromEffective(dataset,dataset.__effectiveOccurrences,dataset.__runtimeProfile);
      return {version,table:bundle.table,term:bundle.term,courses:bundle.model.courses.length,effective:dataset.__effectiveOccurrences.length,icsEvents:ics.generatedEvents,defaultsEqual:AnyClassDefaultPeriodTimes.isDefault(bundle.term.periodTimes),first:dataset.__effectiveOccurrences[0].startTime,profile:AnyClassSchoolProfileRegistry.get("school-other")};
    });
    assert.equal(stored.version,4);assert.equal(stored.courses,29);assert.equal(stored.effective,58);assert.equal(stored.icsEvents,58);
    assert(stored.defaultsEqual);assert.equal(stored.first,"08:00");
    assert.equal(stored.term.academicYear,"2026-2027");assert.equal(stored.term.termCode,"1");assert.equal(stored.term.schoolProfileSnapshot.adapterId,"file");assert.equal(stored.profile,null);
    assert.equal(stored.term.schoolProfileSnapshot.semesterStartDate,"2026-08-31");
    assert.equal(stored.term.timingStatus,"COMPLETE");assert.equal(Object.keys(stored.term.periodTimes).length,11);
    // An explicitly incomplete existing schedule remains supported, without fabricated clock times.
    const incomplete=await page.evaluate(async()=>{await AnyClassTimetableRepository.saveTermPeriodTimes((await AnyClassTimetableRepository.getActiveTimetable()).timetableId,{});const data=await TimetableStorage.activeDataset();let blocked=false;try{await TimetableIcs.generateFromEffective(data,data.__effectiveOccurrences,data.__runtimeProfile);}catch(error){blocked=error.message==="ICS_PERIOD_TIMES_INCOMPLETE";}return {blocked,noFabricatedTimes:data.__effectiveOccurrences.every(item=>!item.startTime&&!item.endTime)};});
    assert(incomplete.blocked&&incomplete.noFabricatedTimes);
    await page.goto(`http://127.0.0.1:${server.address().port}/timetable/`);
    await page.waitForSelector("#mobileWeekList");
    assert.equal(await page.evaluate(()=>TimetableStorage.activeDataset().then(data=>data.__effectiveOccurrences.length)),58);
    await page.goto(`http://127.0.0.1:${server.address().port}/today/`);
    await page.waitForFunction(()=>document.querySelector("#loading")?.hidden);
    assert(!pageErrors.length,`incomplete-time runtime errors: ${pageErrors.join("; ")}`);
    const localDataBefore=await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle().then(bundle=>JSON.stringify(bundle)));
    await page.goto(`http://127.0.0.1:${server.address().port}/local-status/`);
    await page.waitForSelector("#data:not([hidden])");
    assert.equal(await page.locator("#schemaVersion").innerText(),"4");
    assert.equal(await page.locator("#count").innerText(),"29");
    assert.equal(await page.locator("#logicalCount").innerText(),"58");
    assert.equal(await page.locator("#finalCount").innerText(),"58");
    assert.equal(await page.locator("#school").innerText(),"Example Other University");
    assert.equal(await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle().then(bundle=>JSON.stringify(bundle))),localDataBefore);
    await page.goto(`http://127.0.0.1:${server.address().port}/export/`);
    await page.waitForFunction(()=>document.querySelector("#loading")?.textContent.includes("补全上课时间"));
    assert(await page.locator("#app").isHidden());
    await page.goto(`http://127.0.0.1:${server.address().port}/settings/timetable/`);
    await page.waitForSelector("#localScheduleSection:not([hidden])");
    await page.locator("#periodMode").selectOption("CUSTOM");
    await page.locator("#customEnd").fill("1");
    await page.locator("#saveDisplayRange").click();
    assert.match(await page.locator("#displayRangeStatus").innerText(),/不能小于/);
    await page.locator("#periodMode").selectOption("AUTO");
    await page.locator("#saveDisplayRange").click();
    assert.match(await page.locator("#displayRangeStatus").innerText(),/已保存/);
    await page.locator("#localResetTimes").click();
    assert.equal(await page.locator(".schedule-time-row").count(),11);
    await page.locator("#saveLocalSchedule").click();
    await page.waitForFunction(()=>document.querySelector("#localScheduleStatus").textContent.includes("已补全"));
    const completed=await page.evaluate(async()=>{const bundle=await AnyClassTimetableRepository.readActiveBundle();const data=await TimetableStorage.activeDataset();return {status:bundle.term.timingStatus,times:bundle.term.periodTimes,occurrences:data.__effectiveOccurrences.length}});
    assert.equal(completed.status,"COMPLETE");assert.equal(completed.times[1].end,"08:45");assert.equal(completed.times[2].end,"09:40");assert.equal(completed.occurrences,58);
    await page.addScriptTag({url:"/assets/timetable/ics-generator.js"});
    const originalUid=await page.evaluate(async()=>{const data=await TimetableStorage.activeDataset(),result=await TimetableIcs.generateFromEffective(data,data.__effectiveOccurrences,data.__runtimeProfile);return [...result.ics.matchAll(/(?:^|\r\n)UID:([^\r\n]+)/g)].map(item=>item[1])});
    await page.locator(".schedule-time-row input[type=time]").nth(0).fill("08:10");
    await page.locator(".schedule-time-row input[type=time]").nth(2).fill("09:05");
    await page.locator("#saveLocalSchedule").click();
    const revised=await page.evaluate(async()=>{const data=await TimetableStorage.activeDataset(),result=await TimetableIcs.generateFromEffective(data,data.__effectiveOccurrences,data.__runtimeProfile);return {start:data.__effectiveOccurrences[0].startTime,uid:[...result.ics.matchAll(/(?:^|\r\n)UID:([^\r\n]+)/g)].map(item=>item[1])}});
    assert.equal(revised.start,"08:10");assert.deepEqual(revised.uid,originalUid);
    await page.locator("#localResetTimes").click();
    assert.equal(await page.locator(".schedule-time-row input[type=time]").first().inputValue(),"08:00");
    assert.equal(await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle().then(bundle=>bundle.term.periodTimes[1].start)),"08:10");
    await page.goto(`http://127.0.0.1:${server.address().port}/import/?method=file`);
    await page.locator("#fileInput").setInputFiles({name:"synthetic-reimport.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(file))});
    await page.waitForSelector("#filePreview:not([hidden])");await page.locator("#fileSemesterStart").fill("2026-08-31");await acknowledgeConflicts(page);await page.locator("#fileSave").click();
    await page.waitForFunction(()=>/已保存|已更新|没有变化/.test(document.querySelector("#fileSubmitMessage").textContent),null,{timeout:5000}).catch(async error=>{throw Error(`${error.message}; submit=${await page.locator("#fileSubmitMessage").innerText()}; review=${await page.locator("#reimportReview").isVisible()}; file=${await page.locator("#fileMessage").innerText()}`)});
    const preserved=await page.evaluate(async()=>{const bundle=await AnyClassTimetableRepository.readActiveBundle();return {start:bundle.term.periodTimes[1].start,defaultApplied:AnyClassDefaultPeriodTimes.isDefault(bundle.term.periodTimes)}});
    assert.equal(preserved.start,"08:10");assert.equal(preserved.defaultApplied,false);
    let scheduleVisualChecks=0;
    for(const width of [390,430,1024,1440])for(const theme of ["light","dark"]){
      await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:theme});
      await page.goto(`http://127.0.0.1:${server.address().port}/settings/timetable/`);
      await page.waitForSelector("#localScheduleSection:not([hidden])");
      if(visualOutput && [390,1440].includes(width)){
        await page.screenshot({path:path.join(visualOutput,`schedule-settings-${width}-${theme}.png`),fullPage:true});
      }
      const timeLayout=await page.evaluate(()=>{const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}};return {clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,row:box(".schedule-time-row"),start:box(".schedule-time-row input[type=time]"),end:box(".schedule-time-row label:nth-of-type(2) input"),parent:box("#localScheduleEditor"),rowCount:document.querySelectorAll(".schedule-time-row").length,readOnly:document.querySelector(".schedule-time-row label:nth-of-type(2) input").readOnly,actions:["localAddPeriod","localResetTimes","saveLocalSchedule"].every(id=>!!document.getElementById(id))}});
      assert(timeLayout.scrollWidth<=timeLayout.clientWidth,`${width} ${theme}: schedule page overflow`);
      assert(timeLayout.row.right<=timeLayout.parent.right+1&&timeLayout.start.right<timeLayout.end.left,`${width} ${theme}: compact row collision`);
      assert(timeLayout.end.right<=timeLayout.row.right+1&&timeLayout.row.height<106,`${width} ${theme}: oversized schedule row ${JSON.stringify(timeLayout)}`);
      assert(timeLayout.readOnly&&timeLayout.actions&&timeLayout.rowCount>=2,`${width} ${theme}: schedule controls`);
      await page.locator("#localAddPeriod").click();assert.equal(await page.locator(".schedule-time-row").count(),timeLayout.rowCount+1);
      await page.locator("#localResetTimes").click();assert.equal(await page.locator(".schedule-time-row").count(),timeLayout.rowCount);
      await page.locator(".schedule-equal-toggle input").uncheck();
      assert.equal(await page.locator(".schedule-time-row label:nth-of-type(2) input").first().evaluate(input=>input.readOnly),false);
      await page.goto(`http://127.0.0.1:${server.address().port}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name:"synthetic.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(file))});
      await page.waitForSelector("#filePreview:not([hidden])");await page.locator("#fileTimeNow").click();
      assert(await page.locator("#fileSemesterStart").isVisible());
      assert(await page.locator("#fileTimezoneInfo").isVisible());
      assert(await page.locator(".schedule-equal-toggle").isVisible());
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
      scheduleVisualChecks++;
    }
    await page.locator(".schedule-duration input").fill("50");
    await page.locator(".schedule-time-row input[type=time]").first().fill("08:00");
    assert.equal(await page.locator(".schedule-time-row input[type=time]").nth(1).inputValue(),"08:50");
    assert.equal(await page.locator("#fileTimeNow").innerText(),"修改");
    assert.match(await page.locator("#filePeriodHint").innerText(),/已设置/);
    assert(await page.locator(".schedule-time-row input[type=time]").nth(1).evaluate(input=>input.readOnly));
    await page.locator(".schedule-equal-toggle input").uncheck();
    assert(await page.locator(".schedule-time-row label").nth(1).isVisible());
    assert.equal(await page.locator(".schedule-time-row input[type=time]").nth(1).inputValue(),"08:45");
    const advanced=await page.evaluate(()=>{const host=document.createElement("div"),editor=AnyClassScheduleTimes.editor(host,2,{}, {allowExpand:true});host.querySelector(".schedule-equal-toggle input").checked=false;host.querySelector(".schedule-equal-toggle input").dispatchEvent(new Event("change"));const controls=host.querySelectorAll("input[type=time]");controls[0].value="08:00";controls[1].value="08:50";controls[2].value="09:00";controls[3].value="09:35";const times=editor.read();host.querySelector("button").click();return {times,rows:host.querySelectorAll(".schedule-time-row").length,max:AnyClassScheduleTimes.maxPeriod([{endPeriod:8}])}});
    assert.equal(advanced.times[1].end,"08:50");assert.equal(advanced.times[2].end,"09:35");assert.equal(advanced.rows,3);assert.equal(advanced.max,8);
    const modePreservation=await page.evaluate(()=>{const host=document.createElement("div");AnyClassScheduleTimes.editor(host,1,{1:{start:"08:00",end:"08:50"}});const toggle=host.querySelector(".schedule-equal-toggle input"),end=host.querySelectorAll("input[type=time]")[1],duration=host.querySelector(".schedule-duration input");duration.value="45";duration.dispatchEvent(new Event("input"));const derived={value:end.value,readOnly:end.readOnly};toggle.checked=false;toggle.dispatchEvent(new Event("change"));return {derived,restored:end.value,editable:!end.readOnly}});
    assert.deepEqual(modePreservation,{derived:{value:"08:45",readOnly:true},restored:"08:50",editable:true});
    await page.goto(`http://127.0.0.1:${server.address().port}/export/`);
    await page.waitForSelector("#app:not([hidden])");
    assert.equal(await page.locator("#eventCount").innerText(),"58");
    // A different source cannot silently replace the selected workspace; select an empty target explicitly.
    await page.evaluate(async()=>{const target=await AnyClassTimetableRepository.createTimetable({label:"Second Source"});await AnyClassTimetableRepository.setActiveTimetable(target.timetableId);});
    await page.goto(`http://127.0.0.1:${server.address().port}/import/?method=file`);
    await page.locator("#fileInput").setInputFiles({name:"known.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture("school-demo")))});
    await page.waitForSelector("#filePreview:not([hidden])");
    assert(await page.locator("#fileCalendarContext").isVisible());
    assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*Second Source/);
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    await acknowledgeConflicts(page);await page.locator("#fileSave").click();
    await page.waitForFunction(()=>document.querySelector("#fileSubmitMessage").textContent.includes("已保存"));
    assert.equal(await page.evaluate(()=>AnyClassTimetableRepository.listTimetables().then(rows=>rows.length)),2);
    await page.goto(`http://127.0.0.1:${server.address().port}/today/`);
    await page.waitForFunction(()=>document.querySelector("#todayList") !== null);
    assert.equal(await page.evaluate(()=>TimetableStorage.activeDataset().then(data=>data.__courseModel.courses.length)),29);
    await page.goto(`http://127.0.0.1:${server.address().port}/timetable/`);
    await page.waitForFunction(()=>document.querySelector("#weekGrid") !== null);
    assert.equal(await page.evaluate(()=>TimetableStorage.activeDataset().then(data=>data.__courseModel.courses.length)),29);
    assert.deepEqual(pageErrors,[]);
    let visualChecks=0;
    for (const width of [390,430,1024,1440]) for (const theme of ["light","dark"]) {
      const manager=await browser.newPage({viewport:{width,height:844},colorScheme:theme});
      await manager.goto(`http://127.0.0.1:${server.address().port}/settings/timetables/`);
      await manager.waitForSelector("#noTimetables:not([hidden])");
      const action=manager.locator(".timetable-manager-import-action");
      assert.equal(await action.getAttribute("href"),"/import/?method=file");
      assert.equal(await action.evaluate(node=>getComputedStyle(node).textDecorationLine),"none");
      await action.focus();
      assert.equal(await action.evaluate(node=>getComputedStyle(node).textDecorationLine),"none");
      assert(await manager.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
      visualChecks++;
      await manager.close();
    }
    const zoneContext=await browser.newContext({timezoneId:"America/New_York"});
    const zonePage=await zoneContext.newPage();
    await zonePage.goto(`http://127.0.0.1:${server.address().port}/import/?method=file`);
    await zonePage.locator("#fileInput").setInputFiles({name:"zone.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture("school-other")))});
    await zonePage.waitForSelector("#filePreview:not([hidden])");
    assert.match(await zonePage.locator("#fileTimezoneInfo").innerText(),/America\/New_York/);
    await zonePage.locator("#fileSemesterStart").fill("2026-08-31");
    await acknowledgeConflicts(zonePage);await zonePage.locator("#fileSave").click();
    await zonePage.waitForFunction(()=>document.querySelector("#fileSubmitMessage").textContent.includes("已保存"));
    const zone=await zonePage.evaluate(async()=>{const bundle=await AnyClassTimetableRepository.readActiveBundle();return {timezone:bundle.term.timezone,status:bundle.term.timingStatus}});
    assert.equal(zone.timezone,"America/New_York");assert.equal(zone.status,"COMPLETE");
    await zonePage.goto(`http://127.0.0.1:${server.address().port}/settings/timetable/`);
    await zonePage.waitForSelector("#localScheduleSection:not([hidden])");
    await zonePage.locator(".schedule-time-row input[type=time]").nth(0).fill("08:00");
    await zonePage.locator(".schedule-time-row input[type=time]").nth(2).fill("08:55");
    await zonePage.locator("#saveLocalSchedule").click();
    await zonePage.waitForFunction(()=>document.querySelector("#localScheduleStatus").textContent.includes("已补全"));
    await zonePage.goto(`http://127.0.0.1:${server.address().port}/export/`);
    await zonePage.waitForSelector("#app:not([hidden])");
    const zoneIcs=await zonePage.evaluate(async()=>{const data=await TimetableStorage.activeDataset(),result=await TimetableIcs.generateFromEffective(data,data.__effectiveOccurrences,data.__runtimeProfile);return {count:result.generatedEvents,utc:/DTSTART:\d{8}T\d{6}Z/.test(result.ics),shanghai:/DTSTART;TZID=Asia\/Shanghai:/.test(result.ics)}});
    assert.equal(zoneIcs.count,58);assert(zoneIcs.utc);assert(!zoneIcs.shanghai);
    await zoneContext.close();
    const dense=denseFixture();let previewLayouts=0;
    assert.equal(dense.meetings.length,29);
    assert(new Set(dense.meetings.map(item=>item.courseName)).size>=11);
    assert(dense.meetings.some(item=>item.endPeriod>=10));
    for(const width of [390,430,768,1024,1280,1440])for(const theme of ["light","dark"]){
      const audit=await browser.newPage({viewport:{width,height:width<=430?844:900},colorScheme:theme});
      await audit.goto(`http://127.0.0.1:${server.address().port}/import/?method=file`);
      await audit.locator("#fileInput").setInputFiles({name:"synthetic-dense.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(dense))});
      await audit.waitForSelector("#filePreview:not([hidden])");
      if(visualOutput && [390,430].includes(width)){
        await audit.screenshot({path:path.join(visualOutput,`import-date-empty-${width}-${theme}.png`)});
      }
      await audit.locator("#fileSemesterStart").fill("2026-08-31");
      await audit.locator("#fileSemesterStart").evaluate(input=>input.blur());
      if(visualOutput && [390,430].includes(width)){
        await audit.screenshot({path:path.join(visualOutput,`import-supplemental-${width}-${theme}.png`)});
        await audit.locator(".file-preview-scroll").scrollIntoViewIfNeeded();
        await audit.screenshot({path:path.join(visualOutput,`import-preview-top-${width}-${theme}.png`)});
      }
      const geometry=await audit.evaluate(()=>{
        const rect=selector=>{const node=document.querySelector(selector);if(!node)throw Error(`Missing geometry target: ${selector}`);const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        const list=document.querySelector(".file-preview-scroll"),rows=[...document.querySelectorAll("#fileRows tr")];
        const table=document.querySelector(".file-preview-scroll"),first=rows[0],name=first.querySelector(".file-course-name"),location=first.querySelector(".file-course-location");
        const actions=document.querySelector(".file-preview-actions");
        const result={innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,grid:rect(".file-import-grid"),preview:rect("#filePreview"),source:rect(".file-import-column"),schema:rect(".import-schema-panel"),calendar:rect("#fileCalendarContext"),calendarHeading:rect("#fileCalendarContext h3"),dateField:rect(".file-date-field"),dateLabel:rect(".file-date-field label"),dateControl:rect(".file-date-control"),date:rect("#fileSemesterStart"),dateDisplay:rect("#fileDateDisplay"),dateHelper:rect(".file-date-field+p"),timezone:rect("#fileTimezoneInfo"),timeAction:rect("#fileTimeNow"),controls:rect(".file-preview-controls"),list:rect(".file-preview-list"),scroll:rect(".file-preview-scroll"),actions:rect(".file-preview-actions"),blockerHeight:document.querySelector("#fileSubmitBlockers").getBoundingClientRect().height,actionsPosition:getComputedStyle(actions).position,rows:rows.length,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,scrollTop:list.scrollTop,tableColumns:[...document.querySelectorAll(".file-preview-scroll th")].map(item=>item.getBoundingClientRect().width),headerStyles:[...document.querySelectorAll(".file-preview-scroll th")].map(item=>({text:item.textContent.trim(),background:getComputedStyle(item).backgroundColor,position:getComputedStyle(item).position,zIndex:getComputedStyle(item).zIndex})),firstRowColumns:[...first.cells].map(item=>item.getBoundingClientRect().width),nameHeight:name.getBoundingClientRect().height,nameLineHeight:parseFloat(getComputedStyle(name).lineHeight),locationHeight:location.getBoundingClientRect().height,locationLineHeight:parseFloat(getComputedStyle(location).lineHeight),theadDisplay:getComputedStyle(document.querySelector(".file-preview-scroll thead")).display,rowDisplay:getComputedStyle(rows[0]).display,dockDisplay:getComputedStyle(document.querySelector(".shell-bottom-nav")).display,focusOutline:getComputedStyle(table).outlineStyle,semanticOrder:[...document.querySelector("#filePreview").children].map(item=>item.className)};
        list.scrollTop=list.scrollHeight;result.scrolledTop=list.scrollTop;result.lastRow=rows.at(-1).getBoundingClientRect().bottom;return result;
      });
      assert.equal(geometry.rows,29,`${width} ${theme}: dense rows`);
      assert(geometry.scrollWidth<=geometry.clientWidth,`${width} ${theme}: page overflow ${JSON.stringify(geometry)}`);
      assert(geometry.preview.width>=geometry.grid.width-2,`${width} ${theme}: preview not full-width`);
      assert(geometry.preview.right<=geometry.grid.right+2,`${width} ${theme}: preview escapes shell`);
      assert(geometry.date.right<=geometry.calendar.right+1&&geometry.date.left>=geometry.calendar.left-1,`${width} ${theme}: date overflows`);
      assert(geometry.dateField.right<=geometry.calendar.right-8&&geometry.dateControl.right<=geometry.dateField.right+1&&geometry.date.right<=geometry.dateControl.right+1,`${width} ${theme}: date width chain escapes card`);
      assert(geometry.dateDisplay.right<=geometry.calendar.right+1&&geometry.timeAction.right<=geometry.calendar.right+1&&geometry.timeAction.width<130,`${width} ${theme}: formatted date or compact action overflows`);
      assert(await audit.locator("#fileDateDisplay").isHidden());
      assert.equal(await audit.locator("#fileSemesterStart").inputValue(),"2026-08-31");
      assert.equal(await audit.locator("#fileTimeNow").innerText(),"修改");
      assert.match(await audit.locator("#filePeriodHint").innerText(),/默认作息 · 第1节 08:00 开始\s+可在课表设置中修改/);
      assert((await audit.locator("#fileTimeNow").evaluate(button=>button.getBoundingClientRect().height))>=44);
      assert(geometry.scrollHeight>geometry.clientHeight+100&&geometry.scrolledTop>100,`${width} ${theme}: preview does not own long scroll`);
      assert(geometry.lastRow<=geometry.scroll.bottom+3,`${width} ${theme}: last row obscured`);
      assert(geometry.controls.bottom<=geometry.list.top+2&&geometry.list.bottom<=geometry.actions.top+2,`${width} ${theme}: controls/list/actions overlap`);
      assert.equal(geometry.actionsPosition,"static",`${width} ${theme}: confirmation actions must remain in document flow`);
      assert.deepEqual(geometry.semanticOrder,["file-preview-controls","file-preview-list","actions file-preview-actions"]);
      if(width<=430){
        assert(geometry.dateLabel.top-geometry.calendarHeading.bottom>=8&&geometry.date.top-geometry.dateLabel.bottom>=5,`${width} ${theme}: heading or label crowds native date input`);
        assert(geometry.date.top>=geometry.dateControl.top&&geometry.date.bottom<=geometry.dateControl.bottom&&geometry.dateHelper.top-geometry.dateField.bottom>=8&&geometry.timezone.top-geometry.dateHelper.bottom>=8,`${width} ${theme}: native date control or surrounding spacing is cramped ${JSON.stringify({date:geometry.date,dateControl:geometry.dateControl,helperGap:geometry.dateHelper.top-geometry.dateField.bottom,timezoneGap:geometry.timezone.top-geometry.dateHelper.bottom})}`);
        // The explicit import-target sentence adds one compact metadata row; the course list must stay bounded.
        // The visible pre-save validation warning adds one bounded row above the scrollable list.
        assert(geometry.preview.height-geometry.blockerHeight<1660&&geometry.scroll.height<=560,`${width} ${theme}: long preview expands beyond the explicit blocker row ${JSON.stringify({preview:geometry.preview,blockerHeight:geometry.blockerHeight,scroll:geometry.scroll,scrollHeight:geometry.scrollHeight,clientHeight:geometry.clientHeight})}`);
        assert.equal(geometry.theadDisplay,"none");assert.equal(geometry.rowDisplay,"block");assert.notEqual(geometry.dockDisplay,"none");
        assert(geometry.date.left>=geometry.calendar.left+8&&geometry.date.right<=geometry.calendar.right-8,`${width} ${theme}: date touches supplemental card border`);
        assert(geometry.scroll.left>=geometry.preview.left+12&&geometry.scroll.right<=geometry.preview.right-12,`${width} ${theme}: preview viewport escapes card`);
        assert(geometry.lastRow<=geometry.scroll.bottom-2,`${width} ${theme}: final row touches preview boundary`);
        assert(geometry.nameHeight>geometry.nameLineHeight*1.5&&geometry.locationHeight>geometry.locationLineHeight*1.5,`${width} ${theme}: long text did not wrap safely`);
        if(visualOutput){
          await audit.locator("#fileRows tr").nth(14).scrollIntoViewIfNeeded();
          await audit.screenshot({path:path.join(visualOutput,`import-preview-middle-${width}-${theme}.png`)});
          await audit.evaluate(()=>{document.querySelector(".file-preview-scroll").scrollTop=document.querySelector(".file-preview-scroll").scrollHeight;document.querySelector(".file-preview-actions").scrollIntoView({block:"end",behavior:"instant"});});
          await audit.screenshot({path:path.join(visualOutput,`import-preview-bottom-${width}-${theme}.png`)});
        }
        const bottom=await audit.evaluate(()=>{const last=document.querySelector("#fileRows tr:last-child").getBoundingClientRect(),actions=document.querySelector(".file-preview-actions").getBoundingClientRect(),scroll=document.querySelector(".file-preview-scroll").getBoundingClientRect();return {lastBottom:last.bottom,actionsTop:actions.top,actionsBottom:actions.bottom,scrollBottom:scroll.bottom,viewportHeight:innerHeight};});
        assert(bottom.lastBottom<=bottom.scrollBottom+1&&bottom.lastBottom<bottom.actionsTop,`${width} ${theme}: final course row clipped by confirmation actions`);
        await audit.evaluate(()=>{const original=AnyClassTimetableFileStorage;window.AnyClassTimetableFileStorage={...original,putDataset:async()=>{throw Error("SYNTHETIC_STORAGE_FAILURE")}};window.__restorePutDataset=()=>{window.AnyClassTimetableFileStorage=original};});
        await acknowledgeConflicts(audit);await audit.locator("#fileSave").click();
        await audit.waitForFunction(()=>document.querySelector("#fileSubmitMessage").textContent.includes("保存失败"));
        assert.equal(await audit.locator("#fileMessage").innerText(),"文件校验通过，请确认预览后保存。");
        assert.equal(await audit.locator("#fileSubmitMessage").isVisible(),true);
        await audit.evaluate(()=>window.__restorePutDataset());
        await acknowledgeConflicts(audit);await audit.locator("#fileSave").click();
        await audit.waitForFunction(()=>document.querySelector("#filePreview").dataset.importState==="SUCCESS");
        assert(!(await audit.locator("#fileMessage").innerText()).includes("已保存"),`${width} ${theme}: duplicated save feedback at file picker`);
        const feedback=await audit.evaluate(()=>{const message=document.querySelector("#fileSubmitMessage").getBoundingClientRect(),saved=document.querySelector("#fileSaved").getBoundingClientRect();return {messageBottom:message.bottom,savedTop:saved.top,messageVisible:message.bottom<=innerHeight+2,near:saved.top-message.bottom<20};});
        assert(feedback.messageVisible&&feedback.near,`${width} ${theme}: save feedback not beside bottom action`);
        if(visualOutput)await audit.screenshot({path:path.join(visualOutput,`import-submit-feedback-${width}-${theme}.png`)});
      }else if(width>=1024){
        assert.notEqual(geometry.theadDisplay,"none");assert(geometry.tableColumns[0]>geometry.tableColumns[1]);
        assert.deepEqual(geometry.headerStyles.map(item=>item.text),["课程名称","星期 / 节次","地点"]);
        geometry.headerStyles.forEach(item=>{assert.equal(item.position,"sticky");assert.equal(item.zIndex,"2");assert.equal(item.background,theme==="dark"?"rgb(17, 28, 46)":"rgb(255, 255, 255)",`${width} ${theme}: translucent header ${JSON.stringify(item)}`);});
        assert(geometry.tableColumns[1]>=150&&geometry.tableColumns[2]>=180,`${width} ${theme}: table columns cramped`);
        geometry.tableColumns.forEach((size,index)=>assert(Math.abs(size-geometry.firstRowColumns[index])<=2,`${width} ${theme}: header/row misaligned`));
        if(visualOutput){await audit.evaluate(()=>{const list=document.querySelector(".file-preview-scroll");list.scrollTop=32;list.scrollIntoView({block:"center",behavior:"instant"});});await audit.screenshot({path:path.join(visualOutput,`import-desktop-header-${width}-${theme}.png`)});}
      }
      if(width>430){
        await audit.keyboard.press("Tab");
        await audit.locator(".file-preview-scroll").focus();
        assert.notEqual(await audit.locator(".file-preview-scroll").evaluate(item=>getComputedStyle(item).outlineStyle),"none");
      }
      if(width<=430 && await audit.locator("#fileTimeNow").isVisible()){
        await audit.locator("#fileTimeNow").click();
        const expanded=await audit.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,actionsPosition:getComputedStyle(document.querySelector(".file-preview-actions")).position,editorVisible:!document.querySelector("#fileTimeEditor").hidden}));
        assert(expanded.editorVisible&&expanded.scrollWidth<=expanded.clientWidth,`${width} ${theme}: expanded editor overflow`);
        assert.equal(expanded.actionsPosition,"static",`${width} ${theme}: expanded editor changed action positioning`);
      }
      if(width<=430) await audit.locator("#fileGoToday").click();
      else await audit.locator("#fileCancel").click();
      if(width>430) assert(await audit.locator("#filePreview").isHidden());
      if(width<=430)assert.notEqual(await audit.locator(".shell-bottom-nav").evaluate(item=>getComputedStyle(item).display),"none");
      previewLayouts++;await audit.close();
    }
    const todayContext=await browser.newContext({timezoneId:"Asia/Shanghai"});
    await todayContext.addInitScript(() => {const NativeDate=Date,instant="2026-09-24T12:00:00+08:00";globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return new NativeDate(instant).valueOf();}};});
    const todayPage=await todayContext.newPage();
    const futureFile={...fixture("school-other"),meetings:[{courseName:"Course A",weekday:1,startPeriod:3,endPeriod:4,weeks:[5],teacher:"Teacher A",locationRaw:"Building A101"}]};
    await todayPage.goto(`http://127.0.0.1:${server.address().port}/import/?method=file`);
    await todayPage.locator("#fileInput").setInputFiles({name:"synthetic-future.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(futureFile))});
    await todayPage.waitForSelector("#filePreview:not([hidden])");await todayPage.locator("#fileSemesterStart").fill("2026-08-31");await acknowledgeConflicts(todayPage);await todayPage.locator("#fileSave").click();
    await todayPage.waitForFunction(()=>document.querySelector("#fileSubmitMessage").textContent.includes("已保存"));
    await todayPage.evaluate(async()=>{const table=await AnyClassTimetableRepository.getActiveTimetable();await AnyClassTimetableRepository.saveTermPeriodTimes(table.timetableId,{});});
    await todayPage.goto(`http://127.0.0.1:${server.address().port}/today/`);await todayPage.waitForSelector("#app:not([hidden])");
    const future=await todayPage.evaluate(async()=>{const bundle=await AnyClassTimetableRepository.readActiveBundle(),data=await TimetableStorage.activeDataset(),now=new Date("2026-09-24T12:00:00+08:00"),model=TimetableTodayView.createTodayModel(data,data.__runtimeProfile,now),sameDay=Object.create(data);Object.defineProperty(sameDay,"__effectiveOccurrences",{value:data.__effectiveOccurrences.map(item=>({...item,effectiveDate:"2026-09-24",weekday:4}))});const uncertain=TimetableTodayView.createTodayModel(sameDay,data.__runtimeProfile,now);return {storedDate:bundle.term.semesterStartDate,profileDate:data.__runtimeProfile.semesterStartDate,contextDate:data.__effectiveContext.semesterStartDate,week1:TimetableCore.currentWeek(new Date("2026-08-31T12:00:00+08:00"),data.__runtimeProfile),week2:TimetableCore.currentWeek(new Date("2026-09-07T12:00:00+08:00"),data.__runtimeProfile),week3:TimetableCore.currentWeek(new Date("2026-09-14T12:00:00+08:00"),data.__runtimeProfile),week4:TimetableCore.currentWeek(now,data.__runtimeProfile),week5:TimetableCore.currentWeek(new Date("2026-09-28T12:00:00+08:00"),data.__runtimeProfile),nextDate:model.futureItem?.dateKey,nextPeriod:model.futureItem?.periodLabel,nextTime:model.futureItem?.startText,todayCount:model.stats.total,heroState:model.heroState,uncertainHero:uncertain.heroState,ids:data.__effectiveOccurrences.map(item=>item.occurrenceId)}});
    assert.equal(future.storedDate,"2026-08-31");assert.equal(future.profileDate,"2026-08-31");assert.equal(future.contextDate,"2026-08-31");
    assert.equal(future.week1,1);assert.equal(future.week2,2);assert.equal(future.week3,3);assert.equal(future.week4,4);assert.equal(future.week5,5);assert.equal(await todayPage.locator("#dateWeek").innerText(),"第4周");
    assert.equal(future.nextDate,"2026-09-28");assert.equal(future.nextPeriod,"第3–4节");assert.equal(future.nextTime,null);assert.equal(future.todayCount,0);assert.equal(future.heroState,"NO_CLASS");assert.equal(future.uncertainHero,"TIME_UNCERTAIN");
    assert.match(await todayPage.locator("#heroContent").innerText(),/第3–4节/);assert.doesNotMatch(await todayPage.locator("#heroContent").innerText(),/没有未来课程|null/);
    const precise=await todayPage.evaluate(async()=>{const repo=AnyClassTimetableRepository,table=await repo.getActiveTimetable();await repo.saveTermPeriodTimes(table.timetableId,{1:{start:"08:00",end:"08:45"},2:{start:"08:55",end:"09:40"},3:{start:"10:00",end:"10:45"},4:{start:"10:55",end:"11:40"}});const data=await TimetableStorage.activeDataset(),model=TimetableTodayView.createTodayModel(data,data.__runtimeProfile,new Date("2026-09-24T12:00:00+08:00"));return {ids:data.__effectiveOccurrences.map(item=>item.occurrenceId),start:model.futureItem?.startText,end:model.futureItem?.endText,status:data.__phaseBGraph.term.timingStatus}});
    assert.deepEqual(precise.ids,future.ids);assert.equal(precise.start,"10:00");assert.equal(precise.end,"11:40");assert.equal(precise.status,"INCOMPLETE");
    await todayContext.close();
    console.log(JSON.stringify({syntheticRegistered:"PASS",syntheticUnknown:"PASS",schema4:stored.version,courses:stored.courses,effective:stored.effective,defaultIcsEvents:stored.icsEvents,explicitIncompleteIcsBlocked:incomplete.blocked,settingsCompleted:completed.status,deviceTimezone:zone.timezone,adapterPrivileges:"NONE",schedulingVisual:`${scheduleVisualChecks}/8 PASS`,emptyAction:`${visualChecks}/8 PASS`,densePreview:`${previewLayouts}/12 PASS`,todayIncomplete:"PASS",calendarWeek:"5/5 PASS",localDataUnknown:"PASS"}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
