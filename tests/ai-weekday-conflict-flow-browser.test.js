"use strict";
const assert=require("node:assert/strict"),http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),site=path.resolve(__dirname,"../app"),fixture=require("./fixtures/ai-weekday-multi-column-synthetic.json"),out=require("./local-artifacts").evidenceDirectory("ai-weekday-conflict-flow");
const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,"http://local").pathname);if(name.endsWith("/"))name+="index.html";const file=path.resolve(site,"."+name);if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}res.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html"});res.end(fs.readFileSync(file))});
const build=(wrong=false,blocks=fixture.sourceBlocks)=>({schemaVersion:1,school:fixture.school,semester:fixture.semester,meetings:blocks.map(block=>({courseName:block.name,weekday:wrong?1:block.physicalWeekday,startPeriod:block.startPeriod,endPeriod:block.endPeriod,weeks:block.weeks,teacher:"Example Teacher",locationRaw:"Example Room",isAdjusted:false}))});
const retainAll=async page=>{for(const button of await page.locator("#fileConflictItems button").filter({hasText:"确认这是真实冲突，保留两者"}).all())await button.tap()};
const preview=async(page,json)=>{await page.goto(base+"/import/?method=clipboard");await page.locator("#clipboardText").fill(JSON.stringify(json));await page.locator("#clipboardPreview").tap();await page.locator("#filePreview:not([hidden])").waitFor();await page.locator("#fileSchoolName").fill("Example University");await page.locator("#fileSemesterStart").fill("2026-08-31")};
const state=page=>page.evaluate(async()=>{const active=await AnyClassTimetableRepository.getActiveTimetable();if(!active)return {active:null,courses:[]};const bundle=await AnyClassTimetableRepository.readTimetableBundle(active.timetableId);return {active:active.timetableId,courses:(bundle.model?.courses||[]).map(course=>({name:course.title,weekday:course.weekday,start:course.startPeriod,end:course.endPeriod,weeks:course.weeks}))}});
let base;
(async()=>{const deployedBase=process.env.ANYCLASS_BROWSER_BASE?.replace(/\/$/,"");if(!deployedBase)await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));base=deployedBase||`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true,executablePath}),results=[];
try{
  for(const width of [390,430]){
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
    await preview(page,build(true));
    assert.match(await page.locator("#fileConflictWarning").innerText(),/可能是识别错误/);
    assert.match(await page.locator("#fileConflictDetails summary").innerText(),/导入内部 1 组 · 与已有课程 0 处/);
    assert(await page.locator("#fileSave").isDisabled(),"unresolved internal conflicts block save");
    await page.waitForFunction(()=>/时间重叠未处理/.test(document.querySelector("#fileSubmitBlockers")?.textContent||""));
    assert(await page.locator("#fileSubmitBlockers").isVisible(),"disabled save exposes its exact blocker");
    await page.evaluate(()=>document.querySelector("#fileSave").dispatchEvent(new MouseEvent("click",{bubbles:true})));
    assert.match(await page.locator("#fileSubmitMessage").innerText(),/暂不能保存：.*时间重叠未处理/,"rejected submit handler is never silent");
    assert.equal((await state(page)).courses.length,0,"preview makes no writes");
    await page.locator("#fileConflictDetails summary").tap();
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item").count(),2,"Alpha overlaps Beta and Gamma independently");
    const first=page.locator("#fileConflictItems .file-conflict-item").filter({hasText:"Course Beta"}).first();
    const editHit=await first.getByRole("button",{name:"编辑课程 B"}).evaluate(button=>{const rect=button.getBoundingClientRect(),target=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2),dock=document.querySelector(".shell-bottom-nav")?.getBoundingClientRect();return {hit:target===button||button.contains(target),dockOverlap:!!dock&&rect.bottom>dock.top&&rect.top<dock.bottom,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});
    assert(editHit.hit&&!editHit.dockOverlap&&!editHit.overflow,`${width}px first conflict action reachable`);
    await first.getByRole("button",{name:"编辑课程 B"}).tap();
    assert.equal(await page.locator("#filePendingWeekday").inputValue(),"1");
    await page.locator("#filePendingCancel").tap();
    assert(await page.locator("#fileConflictDetails").evaluate(node=>node.open),"cancel returns to expanded conflict review");
    assert.equal(await first.getAttribute("data-review-state"),"UNRESOLVED","cancel clears editing state");
    assert.equal(await page.locator("#fileEditReturnStatus").isVisible(),false,"cancel does not claim resolution");
    await first.getByRole("button",{name:"编辑课程 B"}).tap();
    await page.locator("#filePendingTeacher").fill("Example Teacher Corrected");
    await page.locator("#filePendingApply").tap();
    assert(await page.locator("#fileConflictDetails").evaluate(node=>node.open),"unresolved edit returns to expanded conflict review");
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item").count(),2,"teacher edit does not falsely resolve time overlap");
    assert.equal(await page.locator("#fileEditReturnStatus").isVisible(),false,"unresolved conflict does not claim resolution");
    await page.locator("#fileConflictItems .file-conflict-item").filter({hasText:"Course Beta"}).first().getByRole("button",{name:"编辑课程 B"}).tap();
    const editorGeometry=await page.locator("#filePendingEditor").evaluate(editor=>[...editor.querySelectorAll("select,input,button")].map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right}}));
    assert(editorGeometry.every(rect=>rect.left>=0&&rect.right<=width+1),`${width}px native editor controls fit viewport`);
    await page.locator("#filePendingWeekday").fill("7");await page.locator("#filePendingApply").tap();
    await page.locator("#filePendingEditor").waitFor({state:"hidden"});
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item").count(),1,"first edit revalidates conflict list");
    assert.match(await page.locator("#fileConflictProgress").textContent(),/✓ 已解决/);
    assert.match(await page.locator("#fileEditReturnStatus").textContent(),/✓ 修改已应用，该项冲突已解决/);
    assert(await page.locator("#fileEditReturnStatus").isVisible(),"resolved edit returns to explicit resolution message");
    assert(await page.locator("#fileConflictDetails").evaluate(node=>node.open),"revalidation keeps conflict review expanded for continued editing");
    const second=page.locator("#fileConflictItems .file-conflict-item").filter({hasText:"Course Gamma"}).first();
    await second.getByRole("button",{name:"编辑课程 B"}).tap();
    await page.locator("#filePendingWeekday").fill("5");await page.locator("#filePendingApply").tap();
    await page.locator("#fileConflictReview").waitFor({state:"hidden"});
    assert.match(await page.locator("#fileConflictProgress").textContent(),/待处理 0 项/);
    assert(await page.locator("#fileSave").isEnabled(),"no retained conflicts means no global checkbox");
    assert(await page.locator("#fileSubmitBlockers").isHidden(),"ready save has no blocker message");
    await page.locator("#fileSave").scrollIntoViewIfNeeded();
    const hit=await page.locator("#fileSave").evaluate(button=>{const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,dock=document.querySelector(".shell-bottom-nav")?.getBoundingClientRect(),stack=document.elementsFromPoint(x,y);return {hit:stack[0]===button||button.contains(stack[0]),top:r.top,bottom:r.bottom,dockTop:dock?.top,pointer:getComputedStyle(button).pointerEvents,disabled:button.disabled,aria:button.getAttribute("aria-disabled"),inert:button.inert,stack:stack.slice(0,4).map(node=>node.id||node.className||node.tagName)}});assert(hit.hit&&hit.pointer!=="none"&&!hit.disabled&&hit.aria==="false"&&!hit.inert&&hit.bottom<hit.dockTop,`${width}px ready save hit test: ${JSON.stringify(hit)}`);
    await page.evaluate(()=>{window.__saveEvents={pointerdown:0,touchstart:0,click:0};const button=document.querySelector("#fileSave");for(const type of Object.keys(window.__saveEvents))button.addEventListener(type,()=>window.__saveEvents[type]++,{capture:true})});
    await page.screenshot({path:path.join(out,`resolved-${width}.png`)});
    await page.locator("#fileSave").tap();await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
    assert.equal((await page.evaluate(()=>window.__saveEvents)).click,1,`${width}px one tap fires save click once`);
    const saved=await state(page);assert.deepEqual(saved.courses.map(course=>course.weekday),[1,7,5]);
    await page.goto(base+"/today/");await page.locator("#app:not([hidden])").waitFor();assert.deepEqual(await state(page),saved,"Today reload preserves corrected schedule");
    await page.goto(base+"/timetable/");await page.locator("#app:not([hidden])").waitFor();assert.deepEqual(await state(page),saved,"Timetable reload preserves corrected schedule");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"no mobile overflow");assert.deepEqual(errors,[]);
    results.push({width,wrongWeekdayEdited:true,persisted:true,reloaded:true});await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
  await preview(page,build(false,[fixture.sourceBlocks[0]]));await page.locator("#fileSave").tap();await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
  const original=await state(page);
  await page.goto(base+"/timetable/");await page.locator("#app:not([hidden])").waitFor();
  await page.evaluate(async()=>{const active=await AnyClassTimetableRepository.getActiveTimetable();await AnyClassTimetableRepository.createManualCourse(active.timetableId,{title:"Stored Manual",teacher:"",location:"Example Room",notes:"",weekday:1,weeks:[2],startPeriod:5,endPeriod:6})});
  const withManual=await state(page);
  const updateWithOverlap=build(false,[fixture.sourceBlocks[0],{...fixture.sourceBlocks[1],physicalWeekday:1,startPeriod:5,endPeriod:6}]);
  await preview(page,updateWithOverlap);
  assert.match(await page.locator("#fileConflictDetails summary").innerText(),/导入内部 0 组 · 与已有课程 1 处/);
  assert.equal(await page.locator("#fileConflictItems .file-conflict-item[data-conflict-type='EXISTING']").count(),1);
  await page.locator("#fileCancel").tap();assert.deepEqual(await state(page),withManual,"cancel before save makes zero writes");
  await preview(page,updateWithOverlap);await page.locator("#fileConflictDetails summary").tap();
  assert(await page.locator("#fileConflictConfirm").isDisabled(),"existing conflict requires item-level choice");
  await retainAll(page);await page.locator("#fileConflictConfirm").tap();assert(await page.locator("#fileConflictConfirm").isChecked(),"mobile confirmation control receives a touch");assert(await page.locator("#fileSave").isEnabled(),"explicitly retained conflict may save");
  await page.locator("#fileSave").scrollIntoViewIfNeeded();
  const finalHit=await page.locator("#fileSave").evaluate(button=>{const rect=button.getBoundingClientRect(),target=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2),dock=document.querySelector(".shell-bottom-nav")?.getBoundingClientRect();return {hit:target===button||button.contains(target),target:target?.id||target?.className||target?.tagName,buttonTop:rect.top,buttonBottom:rect.bottom,dockTop:dock?.top,dockBottom:dock?.bottom,dockOverlap:!!dock&&rect.bottom>dock.top&&rect.top<dock.bottom}});assert(finalHit.hit&&!finalHit.dockOverlap,`final save remains tappable above Dock: ${JSON.stringify(finalHit)}`);
  await page.locator("#fileSave").tap();await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS"||!document.querySelector("#reimportReview")?.hidden||document.querySelector("#fileSubmitMessage")?.classList.contains("error"));
  if(await page.locator("#reimportReview").isVisible()){
    for(const checkbox of await page.locator(".reimport-review-ack input").all())await checkbox.check();
    assert(await page.locator("#reimportReviewCommit").isEnabled(),`Phase 4 reimport review must be resolvable: ${JSON.stringify({summary:await page.locator("#reimportReviewSummary").textContent(),items:await page.locator("#reimportReviewItems").textContent()})}`);
    await page.locator("#reimportReviewCommit").tap();
  }
  assert.equal(await page.locator("#filePreview").getAttribute("data-import-state"),"SUCCESS",`post-review import state: ${await page.locator("#fileSubmitMessage").textContent()}`);
  assert((await state(page)).courses.some(course=>course.name==="Stored Manual"),"manual existing course is preserved");
  assert(original.courses.length===1);await context.close();
  for(const correction of ["weeks","periods","skip"]){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
    await preview(page,build(true,fixture.sourceBlocks.slice(0,2)));await page.locator("#fileConflictDetails summary").tap();
    const card=page.locator("#fileConflictItems .file-conflict-item").first();
    if(correction==="skip")await card.getByRole("button",{name:"跳过导入安排 B"}).tap();
    else{
      await card.getByRole("button",{name:"编辑课程 B"}).tap();
      if(correction==="weeks")await page.locator("#filePendingWeeks").fill("3");
      else{await page.locator("#filePendingStart").fill("5");await page.locator("#filePendingEnd").fill("6")}
      await page.locator("#filePendingApply").tap();
    }
    await page.locator("#fileConflictReview").waitFor({state:"hidden"});
    await page.waitForFunction(()=>!document.querySelector("#fileSave").disabled);
    await page.locator("#fileSave").tap();await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
    const saved=await state(page);assert.equal(saved.courses.length,correction==="skip"?1:2,`${correction} pending write count`);
    if(correction==="weeks")assert.deepEqual(saved.courses.find(row=>row.name==="Course Beta").weeks,[3]);
    if(correction==="periods")assert.deepEqual([saved.courses[1].start,saved.courses[1].end],[5,6]);
    if(correction==="skip")assert(!saved.courses.some(row=>row.name==="Course Beta"));
    await context.close();results.push({correction,result:"PASS"});
  }
  {
    const context=await browser.newContext({viewport:{width:430,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
    await preview(page,build(false,[fixture.sourceBlocks[0]]));await page.locator("#fileSave").tap();await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
    await page.goto(base+"/timetable/");await page.locator("#app:not([hidden])").waitFor();
    await page.evaluate(async()=>{const active=await AnyClassTimetableRepository.getActiveTimetable();await AnyClassTimetableRepository.createManualCourse(active.timetableId,{title:"Stored Manual",teacher:"",location:"Example Room",notes:"",weekday:1,weeks:[2],startPeriod:5,endPeriod:6})});
    const before=await state(page),beta={...fixture.sourceBlocks[1],physicalWeekday:1,startPeriod:5,endPeriod:6},gamma={...fixture.sourceBlocks[2],physicalWeekday:1,startPeriod:5,endPeriod:6,weeks:[2]};
    await preview(page,build(false,[fixture.sourceBlocks[0],beta,gamma]));
    assert.match(await page.locator("#fileConflictDetails summary").innerText(),/导入内部 1 组 · 与已有课程 2 处/);
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item[data-conflict-type='INTERNAL']").count(),1);
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item[data-conflict-type='EXISTING']").count(),2);
    await page.locator("#fileCancel").tap();assert.deepEqual(await state(page),before,"both conflict categories cancel without writes");
    await context.close();results.push({bothCategories:true,cancelNoWrite:true});
  }
  {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
    const crowded=Array.from({length:17},(_,index)=>({...fixture.sourceBlocks[0],name:`Synthetic Course ${index+1}`}));
    await preview(page,build(true,crowded));await page.locator("#fileConflictDetails summary").first().tap();
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item").count(),136,"all 136 occurrence-level pairs remain reviewable");
    assert.equal(await page.locator("#fileConflictItems .file-conflict-group").count(),16,"large review groups each pair by its first incoming course");
    await page.locator("#fileConflictItems .file-conflict-group").last().locator("summary").tap();
    const last=page.locator("#fileConflictItems .file-conflict-group").last().locator(".file-conflict-item").first();
    await last.getByRole("button",{name:"编辑课程 B"}).tap();
    await page.locator("#filePendingCancel").tap();
    assert(await page.locator("#fileConflictItems .file-conflict-group").last().evaluate(node=>node.open),"long-list cancel restores originating group");
    assert.equal(await last.getAttribute("data-review-state"),"UNRESOLVED","long-list cancel clears editing state");
    await last.getByRole("button",{name:"编辑课程 B"}).tap();
    await page.locator("#filePendingTeacher").fill("Example Teacher Rechecked");
    await page.locator("#filePendingApply").tap();
    assert(await page.locator("#fileConflictItems .file-conflict-group").last().evaluate(node=>node.open),"long-list unresolved edit restores originating group");
    assert.equal(await page.locator("#fileEditReturnStatus").isVisible(),false,"unresolved long-list edit does not claim resolution");
    await last.getByRole("button",{name:"确认这是真实冲突，保留两者"}).tap();
    assert.equal(await last.getAttribute("data-review-state"),"CONFIRMED_REAL_CONFLICT");
    assert(await page.locator("#fileSave").isDisabled(),"remaining unresolved groups continue to block save");
    await page.locator("#fileSave").scrollIntoViewIfNeeded();
    const longHit=await page.locator("#fileSave").evaluate(button=>{const r=button.getBoundingClientRect(),dock=document.querySelector(".shell-bottom-nav")?.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {hit:hit===button||button.contains(hit),dockTop:dock?.top,bottom:r.bottom,blocker:document.querySelector("#fileSubmitBlockers")?.textContent}});
    assert(longHit.hit&&longHit.bottom<longHit.dockTop&&/时间重叠未处理/.test(longHit.blocker),`tall preview disabled action remains visible and hit-testable: ${JSON.stringify(longHit)}`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"grouped review does not overflow mobile viewport");
    await context.close();results.push({largeConflictCount:136,groups:16,result:"PASS"});
  }
  for(const resolution of ["skip","retain"]){
    const context=await browser.newContext({viewport:{width:430,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
    await preview(page,build(true,fixture.sourceBlocks.slice(0,2)));await page.locator("#fileConflictDetails > summary").tap();
    const card=page.locator("#fileConflictItems .file-conflict-item").first();
    if(resolution==="skip")await card.getByRole("button",{name:"跳过导入安排 B"}).tap();
    else{await card.getByRole("button",{name:"确认这是真实冲突，保留两者"}).tap();await page.locator("#fileConflictConfirm").tap();assert(await page.locator("#fileConflictConfirm").isChecked())}
    await page.locator("#fileSave").scrollIntoViewIfNeeded();
    const hit=await page.locator("#fileSave").evaluate(button=>{const box=button.getBoundingClientRect(),target=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return target===button||button.contains(target)});
    assert(hit,`430px ${resolution} save is hit-testable`);
    await page.locator("#fileSave").tap();await page.waitForFunction(()=>document.querySelector("#filePreview")?.dataset.importState==="SUCCESS");
    assert.equal((await state(page)).courses.length,resolution==="skip"?1:2);
    await context.close();results.push({width:430,resolution,result:"PASS"});
  }
  for(const width of [390,430]){
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
    const crowded=Array.from({length:17},(_,index)=>({...fixture.sourceBlocks[0],name:`Navigation Course ${index+1}`}));
    await preview(page,build(true,crowded));await page.locator("#fileConflictDetails > summary").tap();
    await page.locator("#fileConflictItems .file-conflict-group").first().locator("summary").tap();
    const first=page.locator("#fileConflictItems .file-conflict-group").first().locator(".file-conflict-item").first();
    await first.getByRole("button",{name:"编辑课程 A"}).tap();
    await page.waitForFunction(()=>{const editor=document.querySelector("#filePendingEditor");return document.activeElement===editor&&editor.getBoundingClientRect().top>40&&editor.getBoundingClientRect().top<innerHeight-100});
    const editorPosition=await page.locator("#filePendingEditor").evaluate(node=>node.getBoundingClientRect().top);
    assert(editorPosition>40&&editorPosition<744,`${width}px editor entry has controlled viewport destination`);
    await page.locator("#filePendingCancel").tap();
    await page.waitForFunction(()=>document.activeElement?.classList.contains("file-conflict-item"));
    assert.equal(await first.getAttribute("data-review-state"),"UNRESOLVED",`${width}px return restores source item`);
    await first.getByRole("button",{name:"跳过导入安排 B"}).tap();
    await page.waitForFunction(()=>document.activeElement?.classList.contains("file-conflict-item")&&document.activeElement?.dataset.groupKey==="Navigation Course 1");
    await page.waitForFunction(()=>{const top=document.activeElement?.getBoundingClientRect().top,dock=document.querySelector(".shell-bottom-nav")?.getBoundingClientRect().top||innerHeight;return top>40&&top<dock-40});
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item").count(),120,`${width}px skip revalidates all pairs`);
    const next=page.locator("#fileConflictItems .file-conflict-group").first().locator(".file-conflict-item").first();
    await next.getByRole("button",{name:"跳过导入安排 B"}).tap();
    await page.waitForFunction(()=>document.activeElement?.classList.contains("file-conflict-item")&&document.activeElement?.dataset.groupKey==="Navigation Course 1");
    assert.equal(await page.locator("#fileConflictItems .file-conflict-item").count(),105,`${width}px repeated skip keeps semantic course context`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px long review has no horizontal overflow`);
    await context.close();results.push({width,semanticEditReturn:true,skipSameGroup:true,result:"PASS"});
  }
  {
    const context=await browser.newContext({viewport:{width:430,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
    const crowded=Array.from({length:17},(_,index)=>({...fixture.sourceBlocks[0],name:`Group Course ${index+1}`}));
    await preview(page,build(true,crowded));await page.locator("#fileConflictDetails > summary").tap();
    const group=page.locator("#fileConflictItems .file-conflict-group").nth(14);await group.locator("summary").tap();
    await group.locator(".file-conflict-item").last().getByRole("button",{name:"跳过导入安排 A"}).tap();
    await page.waitForFunction(()=>document.activeElement?.classList.contains("file-conflict-item")&&document.activeElement?.dataset.groupKey==="Group Course 16");
    assert(await page.locator("#fileConflictItems .file-conflict-group").last().evaluate(node=>node.open),"last item skip advances to next unresolved course group");
    await context.close();results.push({skipNextGroup:true,result:"PASS"});
  }
  {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
    await preview(page,build(true,fixture.sourceBlocks.slice(0,2)));await page.locator("#fileConflictDetails > summary").tap();
    await page.locator("#fileConflictItems .file-conflict-item").first().getByRole("button",{name:"跳过导入安排 B"}).tap();
    await page.waitForFunction(()=>document.activeElement?.id==="fileEditReturnStatus");
    await page.waitForFunction(()=>{const top=document.activeElement?.getBoundingClientRect().top,dock=document.querySelector(".shell-bottom-nav")?.getBoundingClientRect().top||innerHeight;return top>40&&top<dock-40});
    assert.match(await page.locator("#fileEditReturnStatus").innerText(),/已跳过/,"final skip goes to review summary rather than unrelated metadata");
    await context.close();results.push({skipFinal:true,result:"PASS"});
  }
  {
    const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,colorScheme:"dark",reducedMotion:"reduce"}),page=await context.newPage();
    await preview(page,build(true,fixture.sourceBlocks.slice(0,2)));await page.locator("#fileConflictDetails > summary").click();
    await page.evaluate(()=>{window.__returnScrolls=[];const original=window.scrollTo;window.scrollTo=function(options,...rest){window.__returnScrolls.push(options?.behavior);return original.call(this,options,...rest)}});
    const card=page.locator("#fileConflictItems .file-conflict-item").first();await card.getByRole("button",{name:"编辑课程 B"}).click();await page.locator("#filePendingCancel").click();
    await page.waitForFunction(()=>window.__returnScrolls.includes("auto"));assert.equal(await card.getAttribute("data-review-state"),"UNRESOLVED","desktop dark reduced-motion cancel restores unresolved pair");
    await card.getByRole("button",{name:"编辑课程 B"}).click();await page.locator("#filePendingWeekday").fill("7");await page.locator("#filePendingApply").click();
    assert(await page.locator("#fileEditReturnStatus").isVisible(),"desktop dark resolved edit has semantic return message");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"desktop dark review does not overflow");
    await preview(page,build(true,fixture.sourceBlocks.slice(0,2)));await page.locator("#fileConflictDetails > summary").click();
    await page.evaluate(()=>{window.__returnScrolls=[];const original=window.scrollTo;window.scrollTo=function(options,...rest){window.__returnScrolls.push(options?.behavior);return original.call(this,options,...rest)}});
    await page.locator("#fileConflictItems .file-conflict-item").first().getByRole("button",{name:"跳过导入安排 B"}).click();
    await page.waitForFunction(()=>document.activeElement?.id==="fileEditReturnStatus"&&window.__returnScrolls.includes("auto"));
    await context.close();results.push({width:1440,theme:"dark",reducedMotion:"reduce",result:"PASS"});
  }
  console.log(JSON.stringify({result:"AI_WEEKDAY_CONFLICT_FLOW_PASS",results,existingConflict:"PASS",cancelNoWrite:"PASS",output:out}));
}finally{await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
