"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium}=require("playwright"),{evidenceDirectory}=require("./local-artifacts");
const app=path.resolve(__dirname,"../app"),evidence=evidenceDirectory("course-dialog-scrollbar");
const styles=["common.css","timetable.css","dialog-fix.css","product-shell.css","timetable-management.css","course-editing.css"];
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${styles.map(name=>`<link rel="stylesheet" href="/assets/timetable/${name}">`).join("")}</head><body data-shell-page="timetable"><main style="min-height:2200px;padding:20px"><h1>合成课表</h1><button id="opener">查看课程</button></main><dialog id="courseDialog" aria-modal="true"><div class="course-dialog-scrim" data-course-dialog-scrim aria-hidden="true"></div><div class="dialog-body"><div class="sheet-handle-zone" aria-hidden="true"><div class="sheet-grabber" data-sheet-grabber></div></div><div class="dialog-head"><h2>合成课程</h2><button id="closeDialog" class="dialog-close" type="button">×</button></div><dl class="dialog-details" id="details"></dl></div></dialog><script src="/assets/timetable/product-shell.js"></script><script>
const dialog=document.querySelector('#courseDialog'),body=dialog.querySelector('.dialog-body');
AnyClassMotion.enableSheetDismiss(dialog,{scrollContainer:body});
window.measure=phase=>{const outer=getComputedStyle(dialog),inner=getComputedStyle(body),rect=dialog.getBoundingClientRect();return{phase,open:dialog.open,outerOverflow:outer.overflowY,outerExcess:dialog.scrollHeight-dialog.clientHeight,innerOverflow:inner.overflowY,innerExcess:body.scrollHeight-body.clientHeight,innerAnimation:inner.animationName,bodyPosition:getComputedStyle(document.body).position,bodyTop:document.body.style.top,scrollY,rootWidth:document.documentElement.clientWidth,rectHeight:rect.height}};
const nativeShow=dialog.showModal.bind(dialog);window.nativeFrames=[];dialog.showModal=()=>{nativeShow();window.nativeFrames.push(window.measure('after-native-showModal'))};
window.beginCase=kind=>{document.querySelector('#details').replaceChildren();const count={short:2,normal:7,long:42}[kind];for(let index=0;index<count;index++){const row=document.createElement('div');row.className='dialog-row';const term=document.createElement('dt');term.textContent='字段'+index;const value=document.createElement('dd');value.textContent=kind==='long'?'合成课程详情，足够长的测试文本 '.repeat(3):'合成内容';row.append(term,value);document.querySelector('#details').append(row)}window.nativeFrames=[];AnyClassMotion.openDialog(dialog,{restoreFocus:document.querySelector('#opener'),focus:document.querySelector('#closeDialog')});return window.measure('after-open')};
window.captureFrames=async(count=25)=>{const frames=[...window.nativeFrames,window.measure('capture-start')];for(let index=0;index<count;index++)await new Promise(resolve=>requestAnimationFrame(()=>{frames.push(window.measure('frame-'+index));resolve()}));return frames};
window.closeCase=()=>AnyClassMotion.closeDialog(dialog);
</script></body></html>`;
const server=http.createServer((request,response)=>{const name=new URL(request.url,"http://local").pathname;if(name==="/__scrollbar/"){response.writeHead(200,{"content-type":"text/html; charset=utf-8"});response.end(html);return}const file=path.resolve(app,"."+name);if(!file.startsWith(app+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return}response.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":"text/css"});response.end(fs.readFileSync(file))});
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
  assert(executablePath,"Chrome or Edge required");const browser=await chromium.launch({headless:true,executablePath,args:["--disable-background-networking"]});
  let assertions=0;const check=(condition,label)=>{assert(condition,label);assertions++},cases=[];
  try{
    for(const width of [320,375,390,430,768,1024,1280,1440])for(const theme of ["light","dark"]){
      const context=await browser.newContext({viewport:{width,height:width<700?844:800},isMobile:width<700,hasTouch:width<700,colorScheme:theme}),page=await context.newPage(),errors=[];
      page.on("pageerror",error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/__scrollbar/`);await page.evaluate(()=>scrollTo({top:900,behavior:"instant"}));
      for(const kind of ["short","normal","long"]){
        const start=await page.evaluate(kind=>window.beginCase(kind),kind),frames=await page.evaluate(()=>window.captureFrames()),rest=frames.at(-1);
        check(frames.every(frame=>frame.open&&frame.outerOverflow==="hidden"),`${width}/${theme}/${kind}: outer dialog never owns scrolling during entry`);
        check(frames.every(frame=>frame.rootWidth===frames[0].rootWidth),`${width}/${theme}/${kind}: page scrollbar width stays stable`);
        check(frames.slice(1).every(frame=>frame.bodyPosition==="fixed"&&frame.bodyTop==="-900px"),`${width}/${theme}/${kind}: background lock and captured position stay stable`);
        check(rest.innerOverflow==="auto"&&(rest.innerExcess>0)===(kind==="long"),`${width}/${theme}/${kind}: genuine long content alone scrolls internally`);
        check(rest.rectHeight<=(width<700?844:800)+1,`${width}/${theme}/${kind}: dialog stays inside viewport`);
        if(kind==="long"){const travel=await page.locator("#courseDialog .dialog-body").evaluate(node=>{node.scrollTop=100;return{top:node.scrollTop,max:node.scrollHeight-node.clientHeight}});check(travel.top===100&&travel.max>100,`${width}/${theme}: long detail remains scrollable`)}
        await page.evaluate(()=>window.closeCase());await page.waitForFunction(()=>!document.querySelector("#courseDialog").open);
        const closed=await page.evaluate(()=>({y:scrollY,bodyPosition:document.body.style.position,rootOverflow:document.documentElement.style.overflow}));
        check(closed.y===900&&closed.bodyPosition===""&&closed.rootOverflow==="",`${width}/${theme}/${kind}: close restores exact scroll and removes lock`);
        check(errors.length===0,`${width}/${theme}/${kind}: no browser error ${errors.join("; ")}`);
        cases.push({width,theme,kind,maxOuterExcess:Math.max(...frames.map(frame=>frame.outerExcess)),innerRestExcess:rest.innerExcess,restHeight:rest.rectHeight,startOuterOverflow:start.outerOverflow});
      }
      if(width===1280&&theme==="dark"){await page.evaluate(()=>window.beginCase("normal"));for(let frame=0;frame<7;frame++)await page.screenshot({path:path.join(evidence,`desktop-open-frame-${frame}.png`),animations:"allow"});await page.evaluate(()=>window.closeCase());await page.waitForFunction(()=>!document.querySelector("#courseDialog").open)}
      await context.close();
    }
    for(const width of [390,1280]){
      const context=await browser.newContext({viewport:{width,height:844},isMobile:width<700,hasTouch:width<700,reducedMotion:"reduce"}),page=await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/__scrollbar/`);await page.evaluate(()=>scrollTo({top:900,behavior:"instant"}));
      const start=await page.evaluate(()=>window.beginCase("long")),frames=await page.evaluate(()=>window.captureFrames(2));
      check(start.outerOverflow==="hidden"&&frames.every(frame=>frame.outerOverflow==="hidden"),`${width}: reduced-motion outer dialog remains non-scrollable`);
      check(frames.at(-1).innerExcess>0&&frames.at(-1).innerAnimation==="none",`${width}: reduced-motion long content scrolls without entry animation`);
      await page.evaluate(()=>window.closeCase());await page.waitForFunction(()=>!document.querySelector("#courseDialog").open);await context.close();
    }
    for(const width of [390,1280]){
      const context=await browser.newContext({viewport:{width,height:844},isMobile:width<700,hasTouch:width<700}),page=await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/__scrollbar/`);await page.evaluate(()=>scrollTo({top:900,behavior:"instant"}));
      for(let cycle=0;cycle<20;cycle++){const opened=await page.evaluate(()=>window.beginCase("normal"));check(opened.outerOverflow==="hidden",`${width} repeated open ${cycle}: no outer scrollbar`);await page.evaluate(()=>window.closeCase());await page.waitForFunction(()=>!document.querySelector("#courseDialog").open);check(await page.evaluate(()=>scrollY===900&&document.body.style.position===""),`${width} repeated close ${cycle}: exact scroll restoration`)}
      await context.close();
    }
    fs.writeFileSync(path.join(evidence,"results.json"),JSON.stringify({result:"COURSE_DIALOG_SCROLLBAR_PASS",assertions,cases},null,2));
    console.log(JSON.stringify({result:"COURSE_DIALOG_SCROLLBAR_PASS",assertions,cases:cases.length,repeatCycles:40,evidence}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
