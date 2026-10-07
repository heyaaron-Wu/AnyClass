"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");
const {chromium}=require("playwright");
const {evidenceDirectory}=require("./local-artifacts");

const root=path.resolve(__dirname,"../app");
const externalBase=process.env.ANYCLASS_TEST_BASE?.replace(/\/$/,"")||"";
const evidence=evidenceDirectory(externalBase?"issue029-residual-polish-beta":"issue029-residual-polish");
const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const mime=file=>file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":file.endsWith(".svg")?"image/svg+xml":file.endsWith(".png")?"image/png":file.endsWith(".json")?"application/json":"text/html";
const server=http.createServer((request,response)=>{let name=decodeURIComponent(new URL(request.url,"http://local").pathname);if(name.endsWith("/"))name+="index.html";const file=path.resolve(root,"."+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return}response.writeHead(200,{"content-type":mime(file),"cache-control":"no-store"});response.end(fs.readFileSync(file))});
const fixture={schemaVersion:1,school:{id:null,name:"Synthetic Outline Audit University"},semester:{academicYear:"2026-2027",term:"1"},timetableName:"Synthetic Outline Audit",meetings:[{courseName:"Course Alpha",teacher:"Teacher A",locationRaw:"Room A",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2,3,4],isAdjusted:false}]};

(async()=>{
  fs.mkdirSync(evidence,{recursive:true});
  if(!externalBase)await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=externalBase||`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath,headless:true,args:["--disable-background-networking","--disable-features=OverlayScrollbar"]});
  let assertions=0;const check=(value,message)=>{assert(value,message);assertions++};const matrix=[];
  const seed=async page=>{await page.goto(`${base}/import/?method=file`);await page.locator("#fileInput").setInputFiles({name:"issue029.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture))});await page.locator("#filePreview:not([hidden])").waitFor();await page.locator("#fileSemesterStart").fill("2026-08-31");await page.waitForFunction(()=>document.querySelector("#filePreview").dataset.importState==="PREVIEW_READY");await page.locator("#fileSave").click();await page.waitForFunction(()=>document.querySelector("#filePreview").dataset.importState==="SUCCESS")};
  try{
    for(const theme of ["light","dark"])for(const width of [390,430]){
      const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,colorScheme:theme});
      const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(String(error)));page.on("console",message=>{if(message.type()==="error")errors.push(message.text())});
      await page.goto(`${base}/`);const button=page.locator(".welcome-dialog[open] [data-onboarding-primary]");await button.waitFor();await page.waitForFunction(()=>document.querySelector("[data-onboarding-dialog]")?.dataset.breathing==="true");await button.evaluate(node=>node.blur());await page.waitForTimeout(350);
      const initial=await button.evaluate(node=>{const own=getComputedStyle(node),pseudo=getComputedStyle(node,"::after"),rect=node.getBoundingClientRect(),text=node.textContent;const animation=node.getAnimations().find(item=>item.animationName==="anyclass-welcome-cta-attention");return{animationName:animation?.animationName,iterationCount:own.animationIterationCount,duration:own.animationDuration,opacity:own.opacity,transform:own.transform,pseudoContent:pseudo.content,pseudoBorder:pseudo.borderTopWidth,text,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}}});
      check(initial.animationName==="anyclass-welcome-cta-attention"&&initial.iterationCount==="3",`${theme} ${width}: Welcome uses a finite three-cycle surface cue`);
      check(initial.pseudoContent==="none"&&initial.pseudoBorder==="0px",`${theme} ${width}: Welcome has no external rectangular pseudo-frame`);
      check(initial.opacity==="1"&&initial.transform==="none",`${theme} ${width}: Welcome label and geometry are not faded or scaled`);
      await page.screenshot({path:path.join(evidence,`${theme}-${width}-welcome-rest-before.png`)});
      await button.evaluate(node=>{const animation=node.getAnimations().find(item=>item.animationName==="anyclass-welcome-cta-attention");animation.pause();animation.currentTime=950});
      const peak=await button.evaluate(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return{background:style.backgroundColor,shadow:style.boxShadow,opacity:style.opacity,transform:style.transform,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}}});
      await page.screenshot({path:path.join(evidence,`${theme}-${width}-welcome-peak.png`)});
      await button.evaluate(node=>node.getAnimations().find(item=>item.animationName==="anyclass-welcome-cta-attention").currentTime=1900);
      const low=await button.evaluate(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return{background:style.backgroundColor,shadow:style.boxShadow,opacity:style.opacity,transform:style.transform,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}}});
      await page.screenshot({path:path.join(evidence,`${theme}-${width}-welcome-low.png`)});
      check(peak.shadow!==low.shadow&&peak.background!==low.background,`${theme} ${width}: only surface/shadow emphasis changes across the pulse`);
      check(Math.abs(peak.rect.x-low.rect.x)<1.25&&Math.abs(peak.rect.y-low.rect.y)<1.25&&Math.abs(peak.rect.width-low.rect.width)<1.25&&Math.abs(peak.rect.height-low.rect.height)<1.25&&peak.opacity===low.opacity&&peak.transform===low.transform,`${theme} ${width}: pulse leaves hit geometry, opacity, and transform stable ${JSON.stringify({peak,low})}`);
      await button.evaluate(node=>{const animation=node.getAnimations().find(item=>item.animationName==="anyclass-welcome-cta-attention");animation.currentTime=5700;animation.finish()});
      const final=await button.evaluate(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return{background:style.backgroundColor,shadow:style.boxShadow,opacity:style.opacity,transform:style.transform,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}}});
      await page.screenshot({path:path.join(evidence,`${theme}-${width}-welcome-rest-final.png`)});
      check(final.shadow==="none"&&final.opacity==="1"&&final.transform==="none"&&Math.abs(final.rect.x-low.rect.x)<1.25&&Math.abs(final.rect.y-low.rect.y)<1.25&&Math.abs(final.rect.width-low.rect.width)<1.25&&Math.abs(final.rect.height-low.rect.height)<1.25,`${theme} ${width}: finite cue returns to the stable primary resting state`);
      await context.addInitScript(()=>localStorage.setItem("anyclass.onboardingCompleted","1"));await seed(page);await page.goto(`${base}/today/`);await page.locator("#app:not([hidden])").waitFor();await page.evaluate(()=>AnyClassHolidayReminders.render(new Date(2026,9,5)));await page.locator("[data-holiday-reminder]:not([hidden])").waitFor();await page.waitForTimeout(420);
      const holiday=await page.evaluate(()=>{const select=document.querySelector("#activeTimetable").getBoundingClientRect(),switcher=document.querySelector("[data-timetable-switcher]").getBoundingClientRect(),status=document.querySelector("[data-switch-status]").getBoundingClientRect(),notice=document.querySelector("[data-holiday-reminder]").getBoundingClientRect();return{controlGap:notice.top-select.bottom,containerGap:notice.top-switcher.bottom,statusWidth:status.width,statusHeight:status.height,overflow:document.documentElement.scrollWidth>innerWidth+1}});
      check(holiday.controlGap>=10&&holiday.controlGap<=18&&holiday.containerGap>=10&&holiday.containerGap<=18&&holiday.statusHeight===0&&!holiday.overflow,`${theme} ${width}: hidden switch status does not create a phantom row before the holiday ${JSON.stringify(holiday)}`);
      await page.screenshot({path:path.join(evidence,`${theme}-${width}-today-holiday.png`)});
      await page.evaluate(()=>AnyClassHolidayReminders.render(new Date(2026,9,8)));check(await page.locator("[data-holiday-reminder]").isHidden(),`${theme} ${width}: non-holiday path remains hidden`);await page.screenshot({path:path.join(evidence,`${theme}-${width}-today-no-holiday.png`)});
      await page.goto(`${base}/timetable/`);await page.locator("#app:not([hidden])").waitFor();await page.locator(".mobile-course").first().click();await page.locator("#courseDialog[open]").waitFor();const closeRing=await page.locator("#closeDialog").evaluate(node=>{const ring=getComputedStyle(node,"::after");return{content:ring.content,border:ring.borderTopWidth,animation:ring.animationName}});check(closeRing.content!=="none"&&closeRing.border==="2px"&&closeRing.animation==="anyclass-blue-emphasis-pulse",`${theme} ${width}: course close ring remains intact`);
      check(errors.length===0,`${theme} ${width}: no runtime errors ${JSON.stringify(errors)}`);matrix.push({theme,width,initial,peak,low,final,holiday,closeRing});await context.close();
    }
    const reduced=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});const reducedPage=await reduced.newPage();await reducedPage.goto(`${base}/`);const reducedButton=reducedPage.locator(".welcome-dialog[open] [data-onboarding-primary]");await reducedButton.waitFor();const reducedState=await reducedButton.evaluate(node=>({animation:getComputedStyle(node).animationName,pseudo:getComputedStyle(node,"::after").content,opacity:getComputedStyle(node).opacity,transform:getComputedStyle(node).transform}));check(reducedState.animation==="none"&&reducedState.pseudo==="none"&&reducedState.opacity==="1"&&reducedState.transform==="none",`reduced motion leaves a static primary button ${JSON.stringify(reducedState)}`);await reducedPage.screenshot({path:path.join(evidence,"reduced-motion-welcome.png")});await reduced.close();
    const focus=await browser.newContext({viewport:{width:430,height:844}});const focusPage=await focus.newPage();await focusPage.goto(`${base}/`);const focusButton=focusPage.locator(".welcome-dialog[open] [data-onboarding-primary]");await focusButton.waitFor();await focusButton.focus();const focusState=await focusButton.evaluate(node=>({visible:node.matches(":focus-visible"),width:getComputedStyle(node).outlineWidth,style:getComputedStyle(node).outlineStyle,offset:getComputedStyle(node).outlineOffset}));check(focusState.visible&&parseFloat(focusState.width)>=2&&focusState.style!=="none",`keyboard focus remains visibly indicated ${JSON.stringify(focusState)}`);await focus.close();
    fs.writeFileSync(path.join(evidence,"measurements.json"),JSON.stringify({result:"ISSUE029_RESIDUAL_POLISH_PASS",assertions,matrix,reducedState,focusState},null,2));console.log(JSON.stringify({result:"ISSUE029_RESIDUAL_POLISH_PASS",assertions,cases:matrix.length,evidence},null,2));
  }finally{await browser.close();if(!externalBase)server.close()}
})().catch(error=>{console.error(error);if(!externalBase)server.close();process.exitCode=1});
