"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {chromium} = require("playwright");
const root = path.resolve(__dirname,"../app");
const out = require("./local-artifacts").evidenceDirectory(process.env.ANYCLASS_TEST_BASE ? "iphone-import-today-beta" : "iphone-import-today");
const checkpoints = [];
async function waitForApp(page, step) {
  checkpoints.push({step, at: Date.now(), url: page.url()});
  try {
    await page.locator("#app:not([hidden])").waitFor();
  } catch (error) {
    const state = await page.evaluate(async () => {
      const app = document.querySelector("#app");
      const active = await Promise.race([
        globalThis.AnyClassTimetableRepository?.getActiveTimetable().then(row => Boolean(row)),
        new Promise(resolve => setTimeout(() => resolve("pending"), 1000))
      ]).catch(() => "error");
      return {
        readyState: document.readyState,
        route: location.pathname,
        shellPage: document.body?.dataset.shellPage,
        appExists: Boolean(app), appHidden: app?.hidden,
        appOpacity: app ? getComputedStyle(app).opacity : null,
        entryClass: app?.classList.contains("today-content-enter"),
        loadingHidden: document.querySelector("#loading")?.hidden,
        emptyHidden: document.querySelector("#emptyState")?.hidden,
        storageErrorHidden: document.querySelector("#storageError")?.hidden,
        activeTimetableReady: active,
        runtimeErrorName: globalThis.__ANYCLASS_PHASE_B_STORAGE_ERROR__?.name || null,
        runtimeErrorStage: globalThis.__ANYCLASS_PHASE_B_STORAGE_ERROR__?.stage || null
      };
    }).catch(() => ({evaluation: "unavailable"}));
    const file = path.join(out, `timeout-${Date.now()}.json`);
    await page.screenshot({path: file.replace(/\.json$/, ".png"), fullPage: true}).catch(() => {});
    fs.writeFileSync(file, JSON.stringify({step, currentUrl: page.url(), state, checkpoints, runtimeErrors: page.__runtimeErrors || [], waitError: error.name}, null, 2));
    console.error(JSON.stringify({diagnostic: file, step, currentUrl: page.url(), state}));
    throw error;
  }
}
const executablePath = [path.join(process.env.LOCALAPPDATA || "","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"] || "","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const server = http.createServer((req,res)=>{
  let name=decodeURIComponent(new URL(req.url,"http://local").pathname);
  if(name.endsWith("/"))name+="index.html";
  const file=path.resolve(root,"."+name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end("not found");return;}
  res.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html","cache-control":"no-store"});
  res.end(fs.readFileSync(file));
});
const fixture = id => ({schemaVersion:1,school:{id,name:"Example University"},semester:{academicYear:"2026-2027",term:"1"},meetings:Array.from({length:29},(_,index)=>({courseName:`Course ${index+1}`,weekday:index%5+1,startPeriod:1,endPeriod:2,weeks:[1,2,3,4,5],teacher:"Teacher A",locationRaw:"Building A101"}))});
async function previewFile(page,id){
  await page.goto(`${base}/import/?method=file`);
  await page.locator("#fileInput").setInputFiles({name:"synthetic.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture(id)))});
  await page.locator("#filePreview:not([hidden])").waitFor();
  assert.equal(await page.locator("#filePreview").getAttribute("data-import-state"),"VALIDATION_REQUIRED");
  assert(await page.locator("#fileSave").isVisible());
  assert(await page.locator("#fileCancel").isVisible());
  assert.notEqual(await page.locator(".shell-bottom-nav").evaluate(node=>getComputedStyle(node).display),"none");
  await page.locator("#fileSemesterStart").fill("2026-08-31");
  if(await page.locator("#fileConflictReview").isVisible()){
    await page.locator("#fileConflictDetails > summary").click();
    assert.match(await page.locator("#fileConflictItems").innerText(),/重叠/);
    await page.locator("#fileConflictItems .file-conflict-group").evaluateAll(groups=>groups.forEach(group=>{group.open=true}));
    for(const button of await page.locator("#fileConflictItems button").filter({hasText:"确认这是真实冲突，保留两者"}).all())await button.click();
    await page.locator("#fileConflictConfirm").check();
    await page.locator("#fileConflictDetails > summary").click();
  }
  assert.equal(await page.locator("#filePreview").getAttribute("data-import-state"),"PREVIEW_READY");
}
async function acknowledgeConflicts(page){if(await page.locator("#fileConflictReview").isVisible()&&!await page.locator("#fileConflictConfirm").isChecked()){await page.locator("#fileConflictDetails > summary").click();assert.match(await page.locator("#fileConflictItems").innerText(),/重叠/);await page.locator("#fileConflictItems .file-conflict-group").evaluateAll(groups=>groups.forEach(group=>{group.open=true}));for(const button of await page.locator("#fileConflictItems button").filter({hasText:"确认这是真实冲突，保留两者"}).all())await button.click();await page.locator("#fileConflictConfirm").check();await page.locator("#fileConflictDetails > summary").click();}}
async function assertToday(page){
  await page.waitForURL(`${base}/today/`);
  await waitForApp(page, "import-to-today");
  assert(await page.locator("#heroContent").innerText());
  assert.equal(Number(await page.locator("#statTotal").innerText()),await page.locator("#todayList .course-row").count(),"Today total matches rendered courses on the test date");
  assert(await page.locator("#app").evaluate(node=>node.classList.contains("today-content-enter")));
  assert.notEqual(await page.locator(".shell-bottom-nav").evaluate(node=>getComputedStyle(node).display),"none");
  assert.equal(await page.locator('.shell-bottom-nav a[href="/"]').getAttribute("aria-current"),"page");
  const active=await page.evaluate(async()=>{const row=await AnyClassTimetableRepository.getActiveTimetable();return {id:row?.timetableId,count:(await AnyClassTimetableRepository.readActiveBundle())?.meetings.length};});
  assert.equal(active.count,29);
}
let base;
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  if(process.env.ANYCLASS_TEST_BASE){
    base=process.env.ANYCLASS_TEST_BASE.replace(/\/$/,"");
  }else{
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    base=`http://127.0.0.1:${server.address().port}`;
  }
  const browser=await chromium.launch({executablePath,headless:true});
  const results=[];
  try{
    for(const width of [390,430]){
      const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,colorScheme:"light"});
      await context.addInitScript(()=>localStorage.setItem("anyclass.onboardingCompleted","1"));
      await context.addInitScript(()=>document.addEventListener("DOMContentLoaded",()=>{
        if(document.body.dataset.shellPage!=="today")return;
        const app=document.querySelector("#app");
        const observer=new MutationObserver(()=>{if(!app.hidden&&!window.__todayFirstReveal){window.__todayFirstReveal={hero:document.querySelector("#heroContent")?.textContent,stats:document.querySelector("#statTotal")?.textContent,entry:app.classList.contains("today-content-enter")};observer.disconnect();}});
        observer.observe(app,{attributes:true,attributeFilter:["hidden"]});
      }));
      const page=await context.newPage(),errors=[];page.__runtimeErrors=errors;page.on("pageerror",error=>errors.push({type:"pageerror",name:error.name,message:error.message}));page.on("console",message=>{if(message.type()==="error")errors.push({type:"console.error",message:message.text()})});
      await previewFile(page,`synthetic-immediate-${width}`);
      await page.screenshot({path:path.join(out,`preview-${width}.png`),fullPage:true});
      await page.locator("#fileSave").click();
      await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
      checkpoints.push({step:"import-committed",at:Date.now(),url:page.url()});
      assert(await page.locator("#fileSave").isHidden());
      assert(await page.locator("#fileCancel").isHidden());
      assert(await page.locator("#fileSaved").isVisible());
      assert(await page.locator("#fileGoToday").isVisible());
      assert.match(await page.locator("#fileSubmitMessage").innerText(),/已保存到此设备：29 个课程安排/);
      assert.match(await page.locator("#fileSubmitMessage").innerText(),/3 秒后自动前往 Today/);
      assert.equal(await page.locator("#fileRows tr").count(),0);
      assert.equal(await page.locator("#fileInput").inputValue(),"");
      await page.screenshot({path:path.join(out,`success-${width}.png`),fullPage:true});
      const started=Date.now();await page.locator("#fileGoToday").click();checkpoints.push({step:"immediate-navigation-clicked",at:Date.now(),url:page.url()});await assertToday(page);
      assert(Date.now()-started<2500,"immediate navigation should not wait for countdown");
      if(width===390){await page.waitForTimeout(3200);assert.equal(new URL(page.url()).pathname,"/today/","immediate navigation left no stale redirect");}
      await page.screenshot({path:path.join(out,`today-${width}.png`),fullPage:true});
      const reveal=await page.evaluate(()=>window.__todayFirstReveal);
      assert(reveal?.hero && reveal?.stats !== "" && reveal?.entry,`Today revealed before core view model was rendered: ${JSON.stringify(reveal)}`);
      await page.goto(`${base}/timetable/`);await waitForApp(page,"timetable-ready");
      await page.locator('.shell-bottom-nav a[href="/"]').click();await page.waitForURL(`${base}/`);await waitForApp(page,"timetable-to-root-today");assert(await page.locator("#heroContent").innerText());
      await page.goto(`${base}/settings/`);
      await page.locator('.back-button[href="/"]').click();await page.waitForURL(`${base}/`);await waitForApp(page,"settings-to-root-today");assert(await page.locator("#heroContent").innerText());
      assert.deepEqual(errors,[]);
      results.push({flow:"immediate",width,result:"PASS"});
      await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
      const page=await context.newPage();await previewFile(page,"reduced-motion");
      await acknowledgeConflicts(page);await page.locator("#fileSave").click();await page.locator("#fileGoToday").click();await assertToday(page);
      assert.equal(await page.locator("#app").evaluate(node=>getComputedStyle(node).animationName),"none");
      results.push({flow:"today-reduced-motion",result:"PASS"});await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await context.addInitScript(()=>localStorage.setItem("anyclass.onboardingCompleted","1"));
      const page=await context.newPage();
      await previewFile(page,"synthetic-auto");
      await page.locator("#fileSave").click();
      await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
      const start=Date.now();
      await assertToday(page);
      const elapsed=Date.now()-start;
      assert(elapsed>=2400&&elapsed<6000,`automatic redirect timing ${elapsed}ms`);
      results.push({flow:"automatic",elapsedMs:elapsed,result:"PASS"});
      await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:390,height:844}});
      const page=await context.newPage();await previewFile(page,"timer-cleanup");
      await page.locator("#fileSave").click();await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
      await page.goto(`${base}/settings/`);await page.waitForTimeout(3200);
      assert.equal(new URL(page.url()).pathname,"/settings/","leaving success must cancel the pending redirect");
      results.push({flow:"redirect-teardown",result:"PASS"});await context.close();
    }
    for(const width of [390,430]){
      const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
      const page=await context.newPage();
      await previewFile(page,`synthetic-cancel-${width}`);
      await page.locator("#fileCancel").click();
      assert(await page.locator("#filePreview").isHidden());
      assert.equal(await page.locator("#filePreview").getAttribute("data-import-state"),"IDLE");
      assert.notEqual(await page.locator(".shell-bottom-nav").evaluate(node=>getComputedStyle(node).display),"none");
      assert.equal(await page.evaluate(async()=>(await AnyClassTimetableRepository.listTimetables()).length),0);
      results.push({flow:"cancel",width,result:"PASS"});
      await context.close();
    }
    for(const width of [390,430]){
      const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
      const page=await context.newPage();
      await previewFile(page,`synthetic-failure-${width}`);
      await page.evaluate(()=>{window.__saveCalls=0;const actual=window.AnyClassReimportReview;window.AnyClassReimportReview={...actual,start:async({onFailure})=>{window.__saveCalls++;await new Promise(resolve=>{window.__releaseSave=()=>{onFailure(Error("SYNTHETIC_FAILURE"));resolve();};});}};});
      await page.locator("#fileSave").click();
      await page.waitForFunction(()=>typeof window.__releaseSave==="function");
      assert.equal(await page.locator("#filePreview").getAttribute("data-import-state"),"SAVING");
      assert(await page.locator("#fileSave").isDisabled());
      await page.evaluate(()=>document.querySelector("#fileSave").click());
      assert.equal(await page.evaluate(()=>window.__saveCalls),1);
      await page.evaluate(()=>window.__releaseSave());
      await page.waitForFunction(()=>document.querySelector("#filePreview").dataset.importState==="SAVE_FAILED");
      assert.match(await page.locator("#fileSubmitMessage").innerText(),/保存失败/);
      assert(await page.locator("#fileSave").isVisible());assert(await page.locator("#fileCancel").isVisible());
      assert.notEqual(await page.locator(".shell-bottom-nav").evaluate(node=>getComputedStyle(node).display),"none");
      assert.equal(new URL(page.url()).pathname,"/import/");
      assert.equal(await page.evaluate(async()=>(await AnyClassTimetableRepository.listTimetables()).length),0);
      results.push({flow:"failure-and-duplicate-prevention",width,result:"PASS"});
      await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await context.addInitScript(()=>localStorage.setItem("anyclass.onboardingCompleted","1"));
      const page=await context.newPage();
      await previewFile(page,"school-a");
      assert.match(await page.locator("#fileImportTarget").innerText(),/将创建新课表/);
      assert.equal(await page.locator("#fileSchoolName").inputValue(),"Example University");
      await page.locator("#fileSchoolName").fill("Confirmed School A");
      await page.locator("#fileTimetableName").fill("Confirmed Timetable A");
      await page.locator("#fileSave").click();
      await page.locator("#fileGoToday").click();await assertToday(page);
      let active=await page.evaluate(()=>AnyClassTimetableRepository.getActiveTimetable());
      assert.equal(active.schoolName,"Confirmed School A");assert.equal(active.label,"Confirmed Timetable A");
      await page.evaluate(async()=>{const row=await AnyClassTimetableRepository.createTimetable({label:"Empty Timetable B"});await AnyClassTimetableRepository.setActiveTimetable(row.timetableId);});
      const missing=fixture("school-b");missing.school.name=null;
      await page.goto(`${base}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name:"missing-school.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(missing))});
      await page.locator("#filePreview:not([hidden])").waitFor();
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*Empty Timetable B/);
      assert.equal(await page.locator("#fileSchoolName").inputValue(),"");
      assert.match(await page.locator("#fileSchoolNameError").innerText(),/请填写学校名称/);
      await page.locator("#filePreview").screenshot({path:path.join(out,"missing-school-390.png")});
      assert(await page.locator("#fileSave").isDisabled());
      await page.locator("#fileSemesterStart").fill("2026-08-31");
      assert(await page.locator("#fileSave").isDisabled());
      await page.locator("#fileSchoolName").fill("Confirmed School B");
      await acknowledgeConflicts(page);
      assert(await page.locator("#fileSave").isEnabled());
      assert.equal(await page.locator("#fileTimetableName").inputValue(),"Empty Timetable B");
      await page.locator("#fileTimetableName").fill("Timetable B");
      await page.locator("#fileSave").click();
      await page.locator("#fileGoToday").click();await assertToday(page);
      active=await page.evaluate(()=>AnyClassTimetableRepository.getActiveTimetable());
      assert.equal(active.schoolName,"Confirmed School B");assert.equal(active.label,"Timetable B");
      assert.equal(await page.evaluate(async()=>{const table=await AnyClassTimetableRepository.getActiveTimetable();return (await AnyClassTimetableRepository.readTimetableBundle(table.timetableId)).term.schoolProfileSnapshot.schoolName;}),"Confirmed School B");
      assert.equal(await page.evaluate(async()=>(await AnyClassTimetableRepository.listTimetables()).length),2);
      const bId=active.timetableId;
      const bIdentity=await page.evaluate(async id=>{const bundle=await AnyClassTimetableRepository.readTimetableBundle(id);return {route:bundle.table.routingKey,courses:bundle.model.courses.map(row=>row.courseId),snapshots:bundle.model.snapshots.map(row=>row.snapshotId)};},bId);
      await page.evaluate(id=>AnyClassTimetableRepository.updateTimetableMetadata(id,{label:"Confirmed Timetable A",schoolName:"Edited School B"}),bId);
      await page.goto(`${base}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name:"existing-a.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture("school-a")))});
      await page.locator("#filePreview:not([hidden])").waitFor();
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*Confirmed Timetable A.*其他来源/);
      await page.locator("#fileSemesterStart").fill("2026-08-31");
      assert(await page.locator("#fileSave").isDisabled(),"a different source cannot silently overwrite the selected populated timetable");
      assert.match(await page.locator("#fileImportMatchText").innerText(),/可能来自已有课表.*Confirmed Timetable A/);
      assert.equal((await page.evaluate(()=>AnyClassTimetableRepository.getActiveTimetable())).timetableId,bId,"preview must not switch current B");
      await page.locator("#fileChangeTarget").click();
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*Confirmed Timetable A/);
      await page.locator("#fileSemesterStart").fill("2026-08-31");
      await page.locator("#fileSchoolName").fill("Confirmed School A");
      await acknowledgeConflicts(page);await page.locator("#fileSave").click();await page.locator("#fileGoToday").click();await assertToday(page);
      active=await page.evaluate(()=>AnyClassTimetableRepository.getActiveTimetable());
      assert.equal(active.label,"Confirmed Timetable A","identity-routed import activates A after save");
      const sameNamedB=await page.evaluate(id=>AnyClassTimetableRepository.getTimetable(id),bId);
      assert.equal(sameNamedB.schoolName,"Edited School B","import A did not overwrite same-named B");
      assert.equal(sameNamedB.label,"Confirmed Timetable A","same display name did not become import identity");
      const bIdentityAfter=await page.evaluate(async id=>{const bundle=await AnyClassTimetableRepository.readTimetableBundle(id);return {route:bundle.table.routingKey,courses:bundle.model.courses.map(row=>row.courseId),snapshots:bundle.model.snapshots.map(row=>row.snapshotId)};},bId);
      assert.deepEqual(bIdentityAfter,bIdentity,"editing B metadata and importing A preserve B identity and source records");
      await page.evaluate(id=>AnyClassTimetableRepository.updateTimetableMetadata(id,{label:"Timetable B",schoolName:"Confirmed School B"}),bId);
      await page.goto(`${base}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name:"same-school.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(missing))});
      await page.locator("#filePreview:not([hidden])").waitFor();
      assert.match(await page.locator("#fileImportMatchText").innerText(),/可能来自已有课表.*Timetable B/);
      await page.locator("#fileChangeTarget").click();
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*Timetable B/);
      assert.equal(await page.locator("#fileTimetableName").inputValue(),"Timetable B");
      assert.equal(await page.locator("#fileSchoolName").inputValue(),"");
      await page.locator("#fileSchoolName").fill("Confirmed School B");
      await page.locator("#fileTimetableName").fill("Renamed Timetable B");
      await page.locator("#fileSemesterStart").fill("2026-08-31");
      await acknowledgeConflicts(page);await page.locator("#fileSave").click();await page.locator("#fileGoToday").click();await assertToday(page);
      active=await page.evaluate(()=>AnyClassTimetableRepository.getActiveTimetable());
      assert.equal(active.label,"Renamed Timetable B");assert.equal(active.schoolName,"Confirmed School B");
      assert.equal(await page.evaluate(async()=>(await AnyClassTimetableRepository.listTimetables()).length),2);
      results.push({flow:"metadata-confirmation-and-isolation",result:"PASS"});
      await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await context.addInitScript(()=>localStorage.setItem("anyclass.onboardingCompleted","1"));
      const page=await context.newPage();
      await previewFile(page,"workspace-a");
      await page.locator("#fileTimetableName").fill("A Only");
      await page.locator("#fileSave").click();await page.locator("#fileGoToday").click();await assertToday(page);
      const a=await page.evaluate(async()=>{const row=await AnyClassTimetableRepository.getActiveTimetable();const bundle=await AnyClassTimetableRepository.readTimetableBundle(row.timetableId);return {id:row.timetableId,courses:bundle.model.courses.map(course=>course.courseId),sourceKey:bundle.term.importMetadata.legacyKey};});
      const b=await page.evaluate(async()=>{const row=await AnyClassTimetableRepository.createTimetable({label:"B Empty"});await AnyClassTimetableRepository.setActiveTimetable(row.timetableId);return row;});
      await previewFile(page,"workspace-a");
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*B Empty/);
      assert.match(await page.locator("#fileImportMatchText").innerText(),/可能来自已有课表.*A Only/);
      assert.equal((await page.evaluate(()=>AnyClassTimetableRepository.getActiveTimetable())).timetableId,b.timetableId);
       const inspectTarget=async()=>{await page.locator("#fileChangeTarget").scrollIntoViewIfNeeded();return page.locator("#fileChangeTarget").evaluate(button=>{const box=button.getBoundingClientRect(),dock=document.querySelector(".shell-bottom-nav")?.getBoundingClientRect(),style=getComputedStyle(button),metadata=button.closest(".file-metadata").getBoundingClientRect(),points=[.15,.5,.85].map(x=>{const hit=document.elementFromPoint(box.left+box.width*x,box.top+box.height/2);return hit===button||button.contains(hit)});return {width:innerWidth,rect:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},metadataWidth:metadata.width,background:style.backgroundColor,visualHeight:visualViewport?.height||innerHeight,pointerEvents:style.pointerEvents,zIndex:style.zIndex,stackingContext:getComputedStyle(button.closest(".file-metadata")).transform,dockOverlap:!!dock&&box.bottom>dock.top&&box.top<dock.bottom,points}})};
       const target390=await inspectTarget();
       assert(target390.points.every(Boolean)&&target390.pointerEvents!=="none"&&!target390.dockOverlap&&target390.rect.bottom-target390.rect.top>=44,"390px alternative-target visible area is not fully tappable");
       assert(target390.rect.right-target390.rect.left<target390.metadataWidth*.9&&target390.background==="rgba(0, 0, 0, 0)","390px target stays visually compact");
       await page.locator("#fileChangeTarget").tap();
       assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*A Only/);
       assert.equal((await page.evaluate(()=>AnyClassTimetableRepository.getActiveTimetable())).timetableId,b.timetableId,"target preview must not change global selection");
       await page.locator("#fileChangeTarget").tap();
       assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*B Empty/);
      await page.screenshot({path:path.join(out,"active-workspace-target-390.png"),fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),"390px target preview overflow");
       await page.setViewportSize({width:430,height:844});
       const target430=await inspectTarget();
       assert(target430.points.every(Boolean)&&target430.pointerEvents!=="none"&&!target430.dockOverlap&&target430.rect.bottom-target430.rect.top>=44,"430px alternative-target visible area is not fully tappable");
       assert(target430.rect.right-target430.rect.left<target430.metadataWidth*.9&&target430.background==="rgba(0, 0, 0, 0)","430px target stays visually compact");
       await page.locator("#fileChangeTarget").tap();
       assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*A Only/);
       await page.locator("#fileChangeTarget").tap();
       assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*B Empty/);
      await page.screenshot({path:path.join(out,"active-workspace-target-430.png"),fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),"430px target preview overflow");
      for(const width of [1024,1440]){await page.setViewportSize({width,height:900});const target=await inspectTarget();assert(target.points.every(Boolean)&&target.rect.right-target.rect.left<target.metadataWidth*.9&&await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}px target action layout`)}
      await page.setViewportSize({width:430,height:844});
      await page.locator("#fileSave").click();await page.locator("#fileGoToday").click();await assertToday(page);
      const state=await page.evaluate(async ids=>{const current=await AnyClassTimetableRepository.getActiveTimetable();const a=await AnyClassTimetableRepository.readTimetableBundle(ids.a);const b=await AnyClassTimetableRepository.readTimetableBundle(ids.b);return {current:current.timetableId,a:{courses:a.model.courses.map(course=>course.courseId),sourceKey:a.term.importMetadata.legacyKey},b:{courses:b.model.courses.map(course=>course.courseId),sourceKey:b.term.importMetadata.legacyKey}};},{a:a.id,b:b.timetableId});
      assert.equal(state.current,b.timetableId,"selected workspace remains active after save");
      assert.deepEqual(state.a,{courses:a.courses,sourceKey:a.sourceKey},"A source records are unchanged");
      assert.equal(state.b.courses.length,a.courses.length,"B receives the same file");
      assert.notEqual(state.b.sourceKey,state.a.sourceKey,"local source storage is isolated");
      assert.equal(state.b.courses.filter(id=>state.a.courses.includes(id)).length,0,"course identities do not collide");
      await previewFile(page,"workspace-a");
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*B Empty/);
      await page.locator("#fileSave").click();
      await page.waitForFunction(()=>["SUCCESS","SAVE_FAILED","REVIEW_REQUIRED","COMMITTED_UNVERIFIED"].includes(document.querySelector("#filePreview")?.dataset.importState));
      assert.equal(await page.locator("#filePreview").getAttribute("data-import-state"),"SUCCESS",await page.locator("#fileSubmitMessage").innerText());
      assert.match(await page.locator("#fileSubmitMessage").innerText(),/课表没有变化/);
      await page.locator("#fileGoToday").click();await assertToday(page);
      const revisedA=fixture("workspace-a");revisedA.meetings[0].locationRaw="Updated Public Room";
      await page.goto(`${base}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name:"same-source-updated.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(revisedA))});
      await page.locator("#filePreview:not([hidden])").waitFor();
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*B Empty/);
      await page.locator("#fileChangeTarget").click();
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*A Only/);
      await page.locator("#fileSemesterStart").fill("2026-08-31");
      await acknowledgeConflicts(page);await page.locator("#fileSave").click();
      await page.waitForFunction(()=>["SUCCESS","SAVE_FAILED","REVIEW_REQUIRED"].includes(document.querySelector("#filePreview")?.dataset.importState));
      assert.equal(await page.locator("#filePreview").getAttribute("data-import-state"),"SUCCESS",await page.locator("#fileSubmitMessage").innerText());
      await page.locator("#fileGoToday").click();await assertToday(page);
      const changed=await page.evaluate(async ids=>{const current=await AnyClassTimetableRepository.getActiveTimetable();const a=await AnyClassTimetableRepository.readTimetableBundle(ids.a);const b=await AnyClassTimetableRepository.readTimetableBundle(ids.b);return {current:current.timetableId,aLocation:a.meetings.find(row=>row.courseName==="Course 1")?.location,bLocation:b.meetings.find(row=>row.courseName==="Course 1")?.location,bSourceKey:b.term.importMetadata.legacyKey};},{a:a.id,b:b.timetableId});
      assert.equal(changed.current,a.id,"explicit alternative activates A");
      assert.equal(changed.aLocation,"Updated Public Room","explicit alternative updates A");
      assert.equal(changed.bLocation,"Building A101","B remains unchanged");
      assert.equal(changed.bSourceKey,state.b.sourceKey);
      await page.goto(`${base}/import/?method=file`);
      await page.locator("#fileInput").setInputFiles({name:"selected-a.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(revisedA))});
      await page.locator("#filePreview:not([hidden])").waitFor();
      assert.match(await page.locator("#fileImportTarget").innerText(),/将导入到：.*A Only/,"selected A remains the default even when B has the same source");
       results.push({flow:"same-file-independent-active-workspaces",targetHitTesting:[target390,target430],result:"PASS"});await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:430,height:844},isMobile:true,hasTouch:true});
      const page=await context.newPage();
      const fromAi=fixture("ai-public");fromAi.school.name="AI Candidate School";
      await page.goto(`${base}/import/?method=clipboard`);
      await page.locator("#clipboardText").fill(JSON.stringify(fromAi));
      await page.locator("#clipboardPreview").click();
      await page.locator("#filePreview:not([hidden])").waitFor();
      assert.equal(await page.locator("#fileSchoolName").inputValue(),"AI Candidate School");
      await page.locator("#fileSchoolName").fill("AI Corrected School");
      await page.locator("#fileTimetableName").fill("Edited Before Cancel");
      await page.locator("#fileCancel").click();
      assert.equal(await page.evaluate(async()=>(await AnyClassTimetableRepository.listTimetables()).length),0);
      assert.equal(await page.locator("#fileSchoolName").inputValue(),"");
      results.push({flow:"ai-candidate-edit-and-cancel",result:"PASS"});
      await context.close();
    }
    console.log(JSON.stringify({result:"PASS",results,screenshotDirectory:out}));
  }finally{await browser.close();if(server.listening)server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
