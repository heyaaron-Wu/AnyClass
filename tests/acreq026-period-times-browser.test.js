"use strict";

const assert=require("node:assert/strict"),fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium}=require("playwright");
const app=path.resolve(__dirname,"../app");
const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const server=http.createServer((request,response)=>{
  let name=decodeURIComponent(new URL(request.url,"http://local").pathname);
  if(name.endsWith("/"))name+="index.html";
  const file=path.resolve(app,"."+name);
  if(!file.startsWith(app+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return;}
  response.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html"});
  response.end(fs.readFileSync(file));
});
const fixture=periodTimes=>({schemaVersion:1,school:{id:null,name:"合成学校"},semester:{academicYear:"2026-2027",term:"1"},meetings:[{courseName:"合成课程",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2],locationRaw:"合成教室"}],...(periodTimes===undefined?{}:{periodTimes})});
const file=payload=>({name:"synthetic.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(payload))});
const complete={1:{start:"07:50",end:"08:35"},2:{start:"08:45",end:"09:30"}};
const changed={1:{start:"07:40",end:"08:25"},2:{start:"08:40",end:"09:25"}};

(async()=>{
  assert(executablePath,"Chrome or Edge required");
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath,headless:true,args:["--disable-background-networking"]});
  let assertions=0;const check=(value,label)=>{assert(value,label);assertions++};
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:"dark",serviceWorkers:"block"});
    const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto(base+"/import/?method=file");
    const validation=await page.evaluate(([full,partial,none])=>{
      const parse=value=>AnyClassTimetableFile.validateAndNormalize(value);
      const resolve=value=>AnyClassImportPeriodTimes.resolve(parse(value).providedPeriodTimes,2,AnyClassDefaultPeriodTimes.clone());
      const failures=[];
      for(const times of [null,{1:{start:"09:30",end:"08:30"}},{1:{start:"08:00",end:"09:10"},2:{start:"09:00",end:"09:45"}},{1:{start:"not-a-time",end:"09:00"}},{1:{start:"08:00",end:"08:45"},2:{start:"08:40",end:"09:25"}}]){
        try{const candidate={...full,periodTimes:times};resolve(candidate);failures.push("ACCEPTED");}catch(error){failures.push(error.message);}
      }
      return {full:resolve(full),partial:resolve(partial),none:resolve(none),failures};
    },[fixture(complete),fixture({1:complete[1]}),fixture(undefined)]);
    check(validation.full.periodTimes[1].start==="07:50"&&validation.full.periodTimeSources[2]==="JSON","complete JSON preferred");
    check(validation.partial.periodTimes[1].start==="07:50"&&validation.partial.periodTimeSources[2]==="DEFAULT","partial source truth");
    check(validation.none.periodTimeSources[1]==="DEFAULT"&&validation.none.periodTimes[1].start==="08:00","missing times use defaults");
    check(validation.failures.every(value=>value!=="ACCEPTED"),"invalid/reversed/overlap fail closed");
    const before=await page.evaluate(()=>AnyClassTimetableRepository.listTimetables().then(rows=>rows.length));
    await page.locator("#fileInput").setInputFiles(file(fixture({1:{start:"09:30",end:"08:30"}})));
    await page.waitForFunction(()=>document.querySelector("#fileMessage")?.classList.contains("error"));
    check(await page.locator("#filePreview").isHidden(),"invalid JSON has no preview");
    check(await page.evaluate(()=>AnyClassTimetableRepository.listTimetables().then(rows=>rows.length))===before,"invalid JSON writes no timetable");
    await page.locator("#fileInput").setInputFiles(file(fixture(complete)));
    await page.locator("#filePreview").waitFor({state:"visible"});
    check(/JSON 提供/.test(await page.locator("#filePeriodHint").innerText()),"JSON source visible");
    check(/07:50–08:35/.test(await page.locator("#fileTimeDetails").innerText()),"effective time visible");
    check(/学校课表/.test(await page.locator("#fileTimeReminder").innerText()),"verification reminder visible");
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    await page.locator("#fileSave").click();
    await page.waitForFunction(()=>document.querySelector("#fileSubmitMessage")?.textContent.includes("已保存"),null,{timeout:8000});
    const saved=await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());
    check(saved.term.periodTimes[1].start==="07:50"&&saved.term.periodTimeSources[1]==="JSON","JSON time and source persist");
    check(saved.term.periodTimes[2].end==="09:30"&&saved.term.schoolProfileSnapshot.periodTimeSources[2]==="JSON","snapshot source persists");
    await page.addScriptTag({url:"/assets/timetable/storage.js"});
    await page.addScriptTag({url:"/assets/timetable/ics-generator.js"});
    await page.addScriptTag({url:"/assets/timetable/current-time.js"});
    const downstream=await page.evaluate(async()=>{
      const dataset=await TimetableStorage.activeDataset();
      const ics=await TimetableIcs.generateFromEffective(dataset,dataset.__effectiveOccurrences,dataset.__runtimeProfile);
      return {start:dataset.__effectiveOccurrences[0].startTime,end:dataset.__effectiveOccurrences[0].endTime,ics:ics.ics,indicator:TimetableCurrentTime.mapMinutesToPosition(8*60,dataset.__runtimeProfile.periodTimes)};
    });
    check(downstream.start==="07:50"&&downstream.end==="09:30"&&downstream.ics.includes("T075000")&&downstream.ics.includes("T093000"),"Today/course detail/ICS effective clock times");
    check(downstream.indicator.phase==="period"&&downstream.indicator.period===1,"current-time indicator uses saved JSON clock times");
    await page.goto(base+"/import/?method=file");
    await page.locator("#fileInput").setInputFiles(file(fixture(changed)));
    await page.locator("#filePreview").waitFor({state:"visible"});
    check(await page.locator("#fileTimeReview").isVisible(),"different reimport requires choice");
    check(await page.locator("#fileSave").isDisabled(),"unreviewed time cannot save");
    check(/第1节/.test(await page.locator("#fileTimeDifference").innerText()),"difference shown");
    await page.locator('input[name="fileTimeChoice"][value="PRESERVE"]').check();
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    await page.locator("#fileSave").click();
    await page.waitForFunction(()=>/已保存|没有变化/.test(document.querySelector("#fileSubmitMessage")?.textContent||""),null,{timeout:8000});
    const preserved=await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());
    check(preserved.term.periodTimes[1].start==="07:50"&&preserved.term.periodTimeSources[1]==="JSON","preserve choice retains existing time/source");
    await page.goto(base+"/import/?method=file");
    await page.locator("#fileInput").setInputFiles(file(fixture(changed)));
    await page.locator("#filePreview").waitFor({state:"visible"});
    await page.locator('input[name="fileTimeChoice"][value="REPLACE"]').check();
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    await page.locator("#fileSave").click();
    await page.waitForFunction(()=>/已保存|课表已更新/.test(document.querySelector("#fileSubmitMessage")?.textContent||""),null,{timeout:8000});
    const replaced=await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());
    check(replaced.term.periodTimes[1].start==="07:40"&&replaced.term.periodTimeSources[1]==="JSON","replace choice commits new JSON time");
    await page.goto(base+"/import/?method=file");
    await page.locator("#fileInput").setInputFiles(file(fixture(changed)));
    await page.locator("#filePreview").waitFor({state:"visible"});
    await page.locator("#fileTimeNow").click();
    await page.locator("#fileTimeEditor .schedule-time-row input[type=time]").first().fill("07:30");
    check(/用户修改/.test(await page.locator("#filePeriodHint").innerText()),"manual correction has higher preview priority");
    await page.locator('input[name="fileTimeChoice"][value="REPLACE"]').check();
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    await page.locator("#fileSave").click();
    await page.waitForFunction(()=>/已保存|课表已更新/.test(document.querySelector("#fileSubmitMessage")?.textContent||""),null,{timeout:8000});
    const corrected=await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());
    check(corrected.term.periodTimes[1].start==="07:30"&&corrected.term.periodTimeSources[1]==="USER_EDITED","manual correction persisted with truthful source");
    await page.goto(base+"/import/?method=file");
    await page.locator("#fileInput").setInputFiles(file({...fixture(complete),periodTimeProvenance:"zhengfang-v9:explicit-single-period-clock-text"}));
    await page.locator("#filePreview").waitFor({state:"visible"});
    check(/教务课表页面提供/.test(await page.locator("#filePeriodHint").innerText()),"Shortcut-declared page provenance reaches shared preview");
    check(await page.locator("#fileTimeReview").isVisible(),"Shortcut timing difference requires same explicit reimport choice");
    await page.locator('input[name="fileTimeChoice"][value="REPLACE"]').check();
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    await page.locator("#fileSave").click();
    await page.waitForFunction(()=>/已保存|课表已更新/.test(document.querySelector("#fileSubmitMessage")?.textContent||""),null,{timeout:8000});
    const sourceSaved=await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());
    check(sourceSaved.term.periodTimeSources[1]==="SOURCE_PAGE"&&sourceSaved.term.periodTimes[1].start==="07:50","source-page timing provenance and value persist");
    await page.goto(base+"/import/?method=file");
    await page.locator("#fileInput").setInputFiles(file(fixture(undefined)));
    await page.locator("#filePreview").waitFor({state:"visible"});
    await page.locator("#fileSemesterStart").fill("2026-08-31");
    await page.locator("#fileSave").click();
    await page.waitForFunction(()=>/已保存|没有变化/.test(document.querySelector("#fileSubmitMessage")?.textContent||""),null,{timeout:8000});
    const sourcePreserved=await page.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());
    check(sourcePreserved.term.periodTimeSources[1]==="SOURCE_PAGE"&&sourcePreserved.term.periodTimes[1].start==="07:50","period-only reimport preserves customized source-page times");
    check(errors.length===0,`runtime errors: ${errors.join("; ")}`);
    await context.close();
    for(const theme of ["light","dark"])for(const width of [320,390,430,768,1280,1440])for(const reduced of [false,true]){
      const context=await browser.newContext({viewport:{width,height:844},colorScheme:theme,reducedMotion:reduced?"reduce":"no-preference",serviceWorkers:"block"});
      const page=await context.newPage();await page.goto(base+"/import/?method=file");
      await page.locator("#fileInput").setInputFiles(file(fixture({1:complete[1]})));
      await page.locator("#filePreview").waitFor({state:"visible"});
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,hint:document.querySelector("#filePeriodHint").textContent,details:document.querySelector("#fileTimeDetails").textContent,reminder:getComputedStyle(document.querySelector("#fileTimeReminder")).display}));
      check(!layout.overflow&&/混合/.test(layout.hint)&&/默认作息补全/.test(layout.details)&&layout.reminder!=="none",`${theme} ${width} reduced=${reduced} preview matrix`);
      await context.close();
    }
    console.log(JSON.stringify({result:"ACREQ026_PERIOD_TIMES_PASS",assertions}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
