"use strict";

const assert=require("node:assert/strict"),fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium}=require("playwright");
const evidence=require("./local-artifacts").evidenceDirectory("p2-import-feedback-contrast");
const app=path.resolve(__dirname,"../app");
const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const server=http.createServer((request,response)=>{
  let name=decodeURIComponent(new URL(request.url,"http://local").pathname);
  if(name.endsWith("/"))name+="index.html";
  const file=path.resolve(app,"."+name);
  if(!file.startsWith(app+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return}
  response.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":file.endsWith(".svg")?"image/svg+xml":"text/html"});
  response.end(fs.readFileSync(file));
});
const valid={schemaVersion:1,school:{id:null,name:"合成学校"},semester:{academicYear:"2026-2027",term:"1"},meetings:[{courseName:"合成课程",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2],locationRaw:"合成教室"}]};
const badCases=[
  {name:"invalid-json",text:"{not-json",expected:/有效的 JSON/},
  {name:"invalid-structure",text:JSON.stringify({school:{name:"合成学校"}}),expected:/schemaVersion 1/},
  {name:"invalid-weekday",text:JSON.stringify({...valid,meetings:[{...valid.meetings[0],weekday:8}]}),expected:/星期/}
];
const luminance=color=>{const parts=(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4});return parts[0]*.2126+parts[1]*.7152+parts[2]*.0722};
const contrast=(a,b)=>{const first=luminance(a),second=luminance(b);return(Math.max(first,second)+.05)/(Math.min(first,second)+.05)};
const rgba=value=>{const values=(value.match(/[\d.]+/g)||[]).map(Number);return{r:values[0],g:values[1],b:values[2],a:values.length>3?values[3]:1}};
const mix=(top,bottom)=>({r:top.r*top.a+bottom.r*(1-top.a),g:top.g*top.a+bottom.g*(1-top.a),b:top.b*top.a+bottom.b*(1-top.a),a:1});
const colorOf=value=>`rgb(${value.r}, ${value.g}, ${value.b})`;
const stops=value=>(value.match(/rgba?\([^)]*\)/g)||[]).map(rgba);
const fixtureFile=(name,text)=>({name:name+".json",mimeType:"application/json",buffer:Buffer.from(text)});

(async()=>{
  assert(executablePath,"Chrome or Edge executable required for browser contrast acceptance");
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath,args:["--disable-background-networking"]});
  let assertions=0;const check=(value,label)=>{assert(value,label);assertions++};
  const visual=[];
  try{
    for(const theme of ["light","dark"])for(const width of [320,375,390,430,768,1024,1440]){
      const context=await browser.newContext({viewport:{width,height:width<700?844:900},colorScheme:theme,serviceWorkers:"block"});
      const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
      await page.goto(base+"/");
      const welcome=page.locator('.welcome-dialog[open] [data-onboarding-primary]');await welcome.waitFor();
      await page.waitForTimeout(450); // Let the dialog's finite entrance finish before measuring rendered CTA contrast.
      const pulse=await welcome.evaluate(node=>{
        const animation=node.getAnimations().find(item=>item.animationName==="anyclass-welcome-cta-attention");
        const samples=[];
        if(animation){animation.pause();for(const progress of [0,.1,.25,.5,.75,.9,1]){animation.currentTime=animation.effect.getTiming().duration*progress;const css=getComputedStyle(node),rect=node.getBoundingClientRect();samples.push({progress,color:css.color,bg:css.backgroundColor,width:rect.width,height:rect.height,opacity:css.opacity})}}
        else{const css=getComputedStyle(node),rect=node.getBoundingClientRect();samples.push({progress:0,color:css.color,bg:css.backgroundColor,width:rect.width,height:rect.height,opacity:css.opacity})}
        return{samples,animation:animation?.animationName||"none",iterations:animation?.effect.getTiming().iterations||0};
      });
      check(pulse.animation==="anyclass-welcome-cta-attention"&&pulse.iterations===3,`${theme} ${width}: finite Welcome pulse retained`);
      for(const sample of pulse.samples){check(contrast(sample.color,sample.bg)>=4.5,`${theme} ${width}: Welcome ${sample.progress} contrast ${contrast(sample.color,sample.bg).toFixed(2)}`);check(sample.width===pulse.samples[0].width&&sample.height===pulse.samples[0].height&&sample.opacity===pulse.samples[0].opacity,`${theme} ${width}: CTA geometry/text opacity stable`)}
      if([390,430,768,1440].includes(width)){
        await welcome.evaluate(node=>{const animation=node.getAnimations().find(item=>item.animationName==="anyclass-welcome-cta-attention");animation.pause();animation.currentTime=animation.effect.getTiming().duration*.5});
        await page.screenshot({path:path.join(evidence,`welcome-${width}-${theme}.png`),animations:"allow"});
      }
      await page.goto(base+"/timetable/");
      const dock=await page.locator('.shell-bottom-nav a[aria-current="page"]').evaluate(node=>{
        const nav=node.parentElement,indicator=getComputedStyle(nav,"::before"),css=getComputedStyle(node);
        return{color:css.color,nav:getComputedStyle(nav).background,indicator:indicator.background,rect:node.getBoundingClientRect().toJSON()};
      });
      const background=theme==="dark"?rgba("rgb(9,17,31)"):rgba("rgb(243,240,232)");
      const navStops=stops(dock.nav),indicatorStops=stops(dock.indicator);
      check(navStops.length>0&&indicatorStops.length>0,`${theme} ${width}: Dock backgrounds measurable`);
      const dockRatios=navStops.flatMap(nav=>indicatorStops.map(indicator=>contrast(dock.color,colorOf(mix(indicator,mix(nav,background))))));
      check(Math.min(...dockRatios)>=4.5,`${theme} ${width}: active Dock contrast ${Math.min(...dockRatios).toFixed(2)}`);
      if([390,430,768,1440].includes(width))await page.screenshot({path:path.join(evidence,`dock-${width}-${theme}.png`),animations:"disabled"});
      await page.goto(base+"/import/?method=file");await page.waitForFunction(()=>!!window.AnyClassSharedJsonImport);
      await page.locator("#fileInput").setInputFiles(fixtureFile("valid-synthetic",JSON.stringify(valid)));
      await page.waitForFunction(()=>document.querySelector("#fileMessage")?.classList.contains("ok"),null,{timeout:5000}).catch(async error=>{throw Error(`${theme} ${width}: valid fixture did not preview: ${JSON.stringify(await page.evaluate(()=>({message:document.querySelector("#fileMessage")?.textContent,state:document.querySelector("#filePreview")?.dataset.importState})))}`,{cause:error})});
      const status=await page.locator("#fileMessage").evaluate(node=>({color:getComputedStyle(node).color,bg:getComputedStyle(node.closest(".card")).backgroundColor,text:node.textContent,role:node.getAttribute("role"),live:node.getAttribute("aria-live"),atomic:node.getAttribute("aria-atomic")}));
      const cardColor=mix(rgba(status.bg),background);
      check(contrast(status.color,colorOf(cardColor))>=4.5,`${theme} ${width}: valid-file status contrast ${contrast(status.color,colorOf(cardColor)).toFixed(2)}`);
      check(status.role==="status"&&status.live==="polite"&&status.atomic==="true",`${theme} ${width}: status announced atomically`);
      if([390,430,768,1440].includes(width))await page.screenshot({path:path.join(evidence,`import-valid-${width}-${theme}.png`),animations:"disabled",fullPage:true});
      check((await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=1,`${theme} ${width}: no horizontal overflow`);
      check(errors.length===0,`${theme} ${width}: no page errors ${errors.join("; ")}`);
      visual.push({theme,width,welcomeMin:+Math.min(...pulse.samples.map(sample=>contrast(sample.color,sample.bg))).toFixed(2),dockMin:+Math.min(...dockRatios).toFixed(2),status:+contrast(status.color,colorOf(cardColor)).toFixed(2)});
      await context.close();
    }
    for(const theme of ["light","dark"])for(const width of [390,430]){
      const context=await browser.newContext({viewport:{width,height:844},colorScheme:theme});const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
      await page.goto(base+"/import/?method=file");await page.waitForFunction(()=>!!window.AnyClassSharedJsonImport);
      const before=await page.evaluate(async()=>{const repository=AnyClassTimetableRepository;await repository.createTimetable({label:"合成既有课表"});return JSON.stringify({tables:await repository.listTimetables(),bundle:await repository.readActiveBundle()})});
      const storedState=()=>page.evaluate(async()=>{const repository=AnyClassTimetableRepository;return JSON.stringify({tables:await repository.listTimetables(),bundle:await repository.readActiveBundle()})});
      for(const test of badCases){await page.locator("#fileInput").setInputFiles(fixtureFile(test.name,test.text));await page.waitForFunction(()=>document.querySelector("#fileMessage")?.classList.contains("error"));const state=await page.evaluate(()=>{const node=document.querySelector("#fileMessage");return{text:node.textContent,hidden:document.querySelector("#filePreview").hidden,role:node.getAttribute("role"),color:getComputedStyle(node).color,bg:getComputedStyle(node.closest(".card")).backgroundColor}});check(test.expected.test(state.text),`${theme} ${width}: ${test.name} explicit error: ${state.text}`);check(state.hidden&&await storedState()===before&&state.role==="status"&&await page.locator("#fileMessage").isVisible(),`${theme} ${width}: ${test.name} no preview/write and accessible visible status`);check(contrast(state.color,colorOf(mix(rgba(state.bg),rgba(theme==="dark"?"rgb(9,17,31)":"rgb(243,240,232)"))))>=4.5,`${theme} ${width}: ${test.name} error text readable`);if(test.name==="invalid-json"){await page.locator("#fileMessage").scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`import-error-${width}-${theme}.png`),animations:"disabled"})}}
      await page.evaluate(()=>{window.__originalFileText=File.prototype.text;File.prototype.text=function(){return Promise.reject(Error("synthetic unreadable file"))}});
      await page.locator("#fileInput").setInputFiles(fixtureFile("unreadable",JSON.stringify(valid)));
      await page.waitForFunction(()=>document.querySelector("#fileMessage")?.textContent?.includes("读取文件失败"));
      check(await page.locator("#filePreview").isHidden(),`${theme} ${width}: file read failure cannot open preview`);
      check(await storedState()===before,`${theme} ${width}: file read failure writes nothing`);
      await page.evaluate(()=>{File.prototype.text=window.__originalFileText});
      await page.locator("#fileInput").setInputFiles(fixtureFile("valid-after-failure",JSON.stringify(valid)));
      await page.waitForFunction(()=>document.querySelector("#fileMessage")?.classList.contains("ok"));
      check(await page.locator("#filePreview").isVisible(),`${theme} ${width}: valid file still previews after failure`);
      check(await storedState()===before,`${theme} ${width}: preview makes no write`);
      await page.locator("#fileInput").setInputFiles(fixtureFile("invalid-after-valid","{not-json"));
      await page.waitForFunction(()=>document.querySelector("#fileMessage")?.classList.contains("error"));
      check(await page.locator("#filePreview").isHidden()&&!(await page.locator("#fileMessage").innerText()).includes("校验通过"),`${theme} ${width}: invalid replacement clears stale valid preview/status`);
      check(await storedState()===before,`${theme} ${width}: invalid replacement preserves existing timetable`);
      check(errors.length===0,`${theme} ${width}: no page errors`);
      await context.close();
    }
    for(const theme of ["light","dark"]){const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:theme,reducedMotion:"reduce"}),page=await context.newPage();await page.goto(base+"/");const state=await page.locator('.welcome-dialog[open] [data-onboarding-primary]').evaluate(node=>{const css=getComputedStyle(node);return{animation:css.animationName,color:css.color,bg:css.backgroundColor}});check(state.animation==="none"&&contrast(state.color,state.bg)>=4.5,`${theme}: reduced-motion CTA static and readable`);await context.close()}
    console.log(JSON.stringify({result:"P2_IMPORT_FEEDBACK_CONTRAST_PASS",assertions,visual,evidence}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
