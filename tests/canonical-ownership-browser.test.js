"use strict";
// Synthetic data only. Atomic rejection is the supported cross-source contract;
// this test does not claim that multiple active imported sources are supported.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const app=path.resolve(process.env.ANYCLASS_TEST_APP_ROOT||path.join(__dirname,'../app')),baseline=Boolean(process.env.ANYCLASS_EXPECT_BASELINE_FAILURE),out=require('./local-artifacts').evidenceDirectory('canonical-ownership');
(async()=>{
 const executablePath=[path.join(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'','Microsoft/Edge/Application/msedge.exe')].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,executablePath});let assertions=0;const records=[];
 try{
 for(const schoolId of baseline?['school-demo']:['school-demo',null])for(const split of [false,true]){
  const context=await browser.newContext();await context.route('https://synthetic.example.invalid/**',route=>{let p=new URL(route.request().url()).pathname;if(p.endsWith('/'))p+='index.html';const f=path.resolve(app,'.'+p);return route.fulfill({status:fs.existsSync(f)?200:404,contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html',body:fs.existsSync(f)?fs.readFileSync(f):''})});
  const page=await context.newPage();await page.goto('https://synthetic.example.invalid/import/');
  for(const name of ['course-editing','occurrence-editing'])await page.addScriptTag({url:'/assets/timetable/'+name+'.js'});
  const result=await page.evaluate(async({schoolId,split,baseline})=>{
   const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}),done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('ABORT'))});
   const native=indexedDB,f=split?{open:(name,v)=>native.open('synthetic-authorized-'+name,v)}:native;
   const s=AnyClassStorageV2,r=AnyClassTimetableRepository,file=AnyClassTimetableFileStorage;
   const make=(id,title='Synthetic A',teacher='Synthetic Teacher')=>{const d=AnyClassTimetableFile.validateAndNormalize({schemaVersion:1,school:{id,name:'Synthetic School'},semester:{academicYear:'2026-2027',term:'1'},meetings:[{courseName:title,teacher,sourceTeachingClassId:'synthetic-stable',weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2]}]});return {...d,fingerprint:JSON.stringify(d.meetings),importedAt:'2026-10-09T00:00:00Z',calendarContext:{semesterStartDate:'2026-08-31',timezone:'Asia/Shanghai',periodTimes:AnyClassDefaultPeriodTimes.clone(),periodTimeSources:{}}}};
   const snapshot=async()=>{const db=await s.openDb(f);try{const names=[...db.objectStoreNames],tx=db.transaction(names);return Object.fromEntries(await Promise.all(names.map(async n=>[n,await req(tx.objectStore(n).getAll())])))}finally{db.close()}};
   const first=await file.putDataset(make(schoolId),f),id=first.graph.timetable.timetableId;await r.setActiveTimetable(id,f);
   const bundle=await r.readTimetableBundle(id,f),course=bundle.model.courses[0];
   if(baseline){await file.putDataset(make(null,'Synthetic other source'),f,{targetTimetableId:id});let error;try{await r.readTimetableBundle(id,f)}catch(e){error=e.message}const rows=await snapshot();return {schoolId,split,error,committed:true,oldCourseRetained:rows.courses.some(c=>c.courseId===course.courseId),oldMeetingRemoved:!rows.baseMeetings.some(m=>m.baseMeetingId===course.sourceMeetingId)}}
   const db=await s.openDb(f),tx=db.transaction(['courseOverrides','occurrenceOverrides','terms'],'readwrite');
   tx.objectStore('courseOverrides').put({courseId:course.courseId,fields:{title:'User title'},updatedAt:'2026-10-09T00:00:00Z'});
   const occurrence=AnyClassEffectiveOccurrences.build(bundle.model,bundle.term)[0];
   tx.objectStore('occurrenceOverrides').put({occurrenceId:occurrence.occurrenceId,courseId:course.courseId,nominalDate:occurrence.nominalDate,fields:{cancelled:true},updatedAt:'2026-10-09T00:00:00Z'});
   const term={...bundle.term,periodTimes:{...bundle.term.periodTimes,1:{start:'07:30',end:'08:00'}},periodTimeSources:{...bundle.term.periodTimeSources,1:'USER_EDITED'}};tx.objectStore('terms').put(term);await done(tx);db.close();
   await r.createManualCourse(id,{title:'Manual course',teacher:'Manual teacher',location:'Manual room',notes:'Keep',weeks:[1,2],weekday:3,startPeriod:3,endPeriod:4},null,f);
   const other=await r.createTimetable({label:'Other workspace',schoolName:'Other school'},f);
   await file.putDataset(make(null,'Other course'),f,{targetTimetableId:other.timetableId});
   await r.setActiveTimetable(id,f);const before=await snapshot(),checks=[];
   const rejected=async(d,hooks,code)=>{let error;try{await file.putDataset(d,f,{targetTimetableId:id,periodTimesChoice:'PRESERVE',...hooks})}catch(e){error=e.message}if(![code,...(code==='IMPORT_SOURCE_OWNERSHIP_REVIEW_REQUIRED'?['ROUTE_TERM_CONFLICT']:[])].includes(error))throw Error('WRONG_REJECTION:'+error);if(JSON.stringify(await snapshot())!==JSON.stringify(before))throw Error('NON_ATOMIC_REJECTION');checks.push(error)};
   await rejected(make(schoolId===null?'school-demo':null),{},'IMPORT_SOURCE_OWNERSHIP_REVIEW_REQUIRED');
   await rejected(make('another-synthetic-school'),{},'IMPORT_SOURCE_OWNERSHIP_REVIEW_REQUIRED');
   // Changing transport without changing canonical source identity is legitimate.
   const update=make(schoolId,'Synthetic A','Updated teacher');
   await rejected(update,{periodTimesChoice:undefined},'IMPORT_PERIOD_TIMES_REVIEW_REQUIRED');
   const corrupt=kind=>({beforeCommit:({transaction,graph})=>{const store=transaction.objectStore('courses');const q=store.index('timetableId').getAll(id);q.onsuccess=()=>{const row=q.result.find(x=>x.sourceType!=='manual'&&x.suppressed!==true);store.put({...row,...(kind==='meeting'?{sourceMeetingId:'missing-meeting'}:{sourceSnapshotId:'missing-snapshot'})})}}});
   await rejected(update,corrupt('meeting'),'TIMETABLE_COURSE_OWNER_CONFLICT');
   await rejected(update,corrupt('snapshot'),'TIMETABLE_COURSE_OWNER_CONFLICT');
   await rejected(update,{beforeCommit:()=>{throw Error('SYNTHETIC_INTERRUPTION')}},'SYNTHETIC_INTERRUPTION');
   await file.putDataset(update,f,{targetTimetableId:id,periodTimesChoice:'PRESERVE'});
   const after=await r.readTimetableBundle(id,f),all=await snapshot();
   if(after.model.courseOverrides[0].fields.title!=='User title'||after.model.occurrenceOverrides[0].fields.cancelled!==true||!after.model.courses.some(c=>c.sourceType==='manual')||after.term.periodTimes[1].start!=='07:30')throw Error('USER_EDITS_LOST');
   const otherBefore=before.courses.filter(c=>c.timetableId===other.timetableId),otherAfter=all.courses.filter(c=>c.timetableId===other.timetableId);if(JSON.stringify(otherBefore)!==JSON.stringify(otherAfter))throw Error('OTHER_WORKSPACE_CHANGED');
   if((await r.getActiveTimetable(f)).timetableId!==id)throw Error('TARGET_CHANGED');
   if(split&&(await r.listTimetables()).length!==0)throw Error('WRONG_FACTORY_WRITTEN');
   return {schoolId,split,checks,userEdits:true,manual:true,customTimes:true,otherWorkspace:true,activeUnchanged:true,canonicalReadable:true,factoryIsolation:true};
  },{schoolId,split,baseline});
  if(baseline){assert.equal(result.error,'TIMETABLE_COURSE_OWNER_CONFLICT');assert(result.committed&&result.oldCourseRetained&&result.oldMeetingRemoved);assertions+=4}else{assert.equal(result.checks.length,6);assert(result.canonicalReadable&&result.userEdits&&result.manual&&result.customTimes&&result.otherWorkspace&&result.activeUnchanged&&result.factoryIsolation);assertions+=13}records.push(result);await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({assertions,records},null,2));console.log(JSON.stringify({result:baseline?'FROZEN_BETA5_OWNERSHIP_FAILURE_REPRODUCED':'CANONICAL_OWNERSHIP_ATOMICITY_PASS',assertions,records,evidence:out}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
