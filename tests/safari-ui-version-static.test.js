'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),app=path.join(root,'app'),id=require('../release/safari-ui-fix-identity.json'),runtime=require('../app/assets/timetable/release-metadata.js');
let assertions=0;const check=(value,label)=>{assert(value,label);assertions++};
for(const k of ['productVersion','releaseId','releaseMode'])check(runtime[k]===id[k],'runtime '+k+' derives from release identity');
const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(path.join(dir,e.name)):[path.join(dir,e.name)]);
for(const file of visit(app).filter(p=>p.endsWith('.html'))){const html=fs.readFileSync(file,'utf8');if(!html.includes('anyclass-release'))continue;check(html.includes('content="'+id.releaseId+'"'),'HTML identity '+path.relative(app,file));for(const match of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css)(?:\?[^"]*)?)"/g))check(new URL(match[1],'https://local.invalid').searchParams.get('v')===id.releaseId,'release-keyed dependency '+match[1]);}
const shell=fs.readFileSync(path.join(app,'assets/timetable/product-shell.js'),'utf8'),about=fs.readFileSync(path.join(app,'about/index.html'),'utf8'),imp=fs.readFileSync(path.join(app,'import/index.html'),'utf8');
check(shell.includes('loadedMetadata.releaseId===declaredRelease'),'cross-surface identity guard');
check(about.includes('const release=window.AnyClassReleaseIdentity'),'About consumes validated identity');
check(!imp.includes('mobileShortcutIntro'),'obsolete introductory DOM/binding removed');
check(imp.includes('运行时可选择正式版或测试版'),'essential channel guidance preserved');
check(about.includes('网站更新记录')&&about.includes('未部署候选不计作发布'),'history distinguishes deployed evidence and candidate');
for(const file of ['storage-v2.js','course-model.js','course-resolver.js','import-file-app.js','import-file-storage.js','schedule-times.js','schema4-plan.js','default-period-times.js','import-client-channels.js']){
const full=path.join(app,'assets/timetable',file);if(!fs.existsSync(full))continue;cp.execFileSync('git',['-C',root,'diff','--exit-code',id.baseCommit,'--','app/assets/timetable/'+file],{stdio:'pipe'});check(true,'unchanged core '+file);
}
if(id.channel==='stable'){const install=fs.readFileSync(path.join(app,'shortcuts/install/index.html'),'utf8'),manifest=require('../app/shortcuts/manifest.json');check(!/<script\b/i.test(install),'static no-JS');check(install.includes('href="/about/#aboutShortcutTitle"'),'fixed same-origin return');check(!/location\.|history\.|returnTo/.test(install),'no dynamic/untrusted back navigation');check(manifest.enabled===false&&manifest.reviewed===false&&manifest.latestBuild===1&&manifest.updateUrl===null&&manifest.publishedAt===null,'update manifest remains disabled');}
console.log(JSON.stringify({result:'SAFARI_UI_VERSION_STATIC_PASS',channel:id.channel,assertions}));

