"use strict";
const assert=require("node:assert/strict");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),site=path.resolve(__dirname,"../app");
const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,"http://local").pathname);if(name.endsWith("/"))name+="index.html";const file=path.resolve(site,"."+name);if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":"text/html"});res.end(fs.readFileSync(file));});
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({headless:true,executablePath});const page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/about/`);
    for(const name of ["school-profile","school-config","phaseb-engine","course-model","course-resolver","effective-occurrences","ics-generator","course-editing","schema4-plan","storage-v2","timetable-repository","session-grouping","storage"])await page.addScriptTag({url:`/assets/timetable/${name}.js`});
    const result=await page.evaluate(async()=>{
      const req=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error("TX_ABORT"))});
      await req(indexedDB.deleteDatabase("course-app"));
      const profile=AnyClassSchoolProfileRegistry.get("school-demo");
      const original=[{courseName:"Course A",teacher:"Teacher A",locationRaw:"Building A101",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2],sourceTeachingClassId:"synthetic-A"},{courseName:"Course B",teacher:"Teacher B",locationRaw:"Building B202",weekday:2,startPeriod:3,endPeriod:4,weeks:[1,2],sourceTeachingClassId:"synthetic-B"}];
      const make=(meetings,fingerprint)=>({key:"school-demo::2026-2027::1",school:{id:"school-demo",name:"Example University",sourceSystem:"zhengfang-v9"},semester:{academicYear:"2026-2027",term:"1"},source:"zhengfang-v9",completeness:"COMPLETE",importedAt:`2026-09-${String(Number(fingerprint)+1).padStart(2,"0")}T00:00:00.000Z`,fingerprint,meetings});
      const repo=AnyClassTimetableRepository,storage=AnyClassStorageV2;
      const snapshots=async()=>{const db=await storage.openDb();try{return await req(db.transaction("importSnapshots").objectStore("importSnapshots").getAll())}finally{db.close()}};
      const raw=async()=>{const db=await storage.openDb();try{return await req(db.transaction("courses").objectStore("courses").getAll())}finally{db.close()}};
      await storage.putLegacyAndMigrate(make(original,"1"),profile);
      const noChange=await storage.putLegacyAndMigrate(make(original,"1"),profile);
      if(noChange.status!=="NO_CHANGE"||(await snapshots()).length!==1)throw Error("NO_CHANGE_FAST_PATH_FAILED");
      const first=await repo.readActiveBundle(),firstId=first.model.courses.find(x=>x.title==="Course A").courseId;
      const firstUid=(await TimetableIcs.generateFromEffective(await TimetableStorage.activeDataset(),(await TimetableStorage.activeDataset()).__effectiveOccurrences,(await TimetableStorage.activeDataset()).__runtimeProfile)).ics.match(/UID:[^\r\n]+/g);
      const teacherChanged=original.map((row,i)=>i?row:{...row,teacher:"Teacher Changed"});
      const auto=await storage.putLegacyAndMigrate(make(teacherChanged,"2"),profile);
      const teacher= (await repo.readActiveBundle()).model.courses.find(x=>x.courseId===firstId).teacher;
      if(teacher!=="Teacher Changed"||auto.mergeResult.sourceUpdatedCourses!==1)throw Error("AUTO_SOURCE_UPDATE_FAILED");
      const db=await storage.openDb(),tx=db.transaction("courseOverrides","readwrite");tx.objectStore("courseOverrides").put({courseId:firstId,fields:{title:"Course Mine"},updatedAt:new Date().toISOString()});await done(tx);db.close();
      const changed=teacherChanged.map((row,i)=>i?row:{...row,courseName:"Course Source"});
      const beforeSnapshots=(await snapshots()).length;
      let conflict=null;try{await storage.putLegacyAndMigrate(make(changed,"3"),profile)}catch(error){conflict=error.mergeResult||null}
      if(!conflict?.requiresReview||conflict.conflicts[0]?.field!=="title")throw Error("CONFLICT_NOT_STRUCTURED");
      const afterConflict=(await snapshots()).length;
      if(beforeSnapshots!==afterConflict)throw Error("CONFLICT_TRANSACTION_NOT_ROLLED_BACK");
      let staleRejected=false;try{await storage.putLegacyAndMigrate(make(changed,"3"),profile,indexedDB,{expectedReviewSignature:"outdated-review",mergeResolutions:{[`${firstId}:title`]:"KEEP_MINE"}})}catch(error){staleRejected=error.message==="REIMPORT_REVIEW_STALE"}
      if(!staleRejected||(await snapshots()).length!==beforeSnapshots)throw Error("STALE_REVIEW_NOT_REJECTED");
      const keep=await storage.putLegacyAndMigrate(make(changed,"3"),profile,indexedDB,{mergeResolutions:{[`${firstId}:title`]:"KEEP_MINE"}});
      const afterKeep=await repo.readActiveBundle();
      const keptSource=afterKeep.model.courses.find(x=>x.courseId===firstId),keptOverride=afterKeep.model.courseOverrides.find(x=>x.courseId===firstId);
      if(keptSource.title!=="Course Source"||keptOverride?.fields.title!=="Course Mine"||keep.mergeResult.requiresReview)throw Error("KEEP_MINE_FAILED");
      const afterUid=(await TimetableIcs.generateFromEffective(await TimetableStorage.activeDataset(),(await TimetableStorage.activeDataset()).__effectiveOccurrences,(await TimetableStorage.activeDataset()).__runtimeProfile)).ics.match(/UID:[^\r\n]+/g);
      if(JSON.stringify(firstUid)!==JSON.stringify(afterUid))throw Error("UID_CHANGED_ON_METADATA_EDIT");
      const newer=changed.map((row,i)=>i?row:{...row,courseName:"Course Newest"});
      const adopt=await storage.putLegacyAndMigrate(make(newer,"4"),profile,indexedDB,{mergeResolutions:{[`${firstId}:title`]:"ADOPT_SOURCE"}});
      const afterAdopt=await repo.readActiveBundle();
      if(afterAdopt.model.courseOverrides.some(x=>x.courseId===firstId)||afterAdopt.model.courses.find(x=>x.courseId===firstId).title!=="Course Newest")throw Error("ADOPT_SOURCE_FAILED");
      const snapshotsBeforeFailure=(await snapshots()).length;
      let injected=false;try{await storage.putLegacyAndMigrate(make(newer.map((row,i)=>i?row:{...row,teacher:"Failure Injection"}),"5"),profile,indexedDB,{beforeCommit:()=>{throw Error("INJECTED_FAILURE")}})}catch(error){injected=error.message==="INJECTED_FAILURE"}
      if(!injected||(await snapshots()).length!==snapshotsBeforeFailure)throw Error("FAILURE_INJECTION_ROLLBACK_FAILED");
      const newCourse={courseName:"Course C",teacher:"Teacher C",locationRaw:"Building C303",weekday:3,startPeriod:5,endPeriod:6,weeks:[1,2],sourceTeachingClassId:"synthetic-C"};
      const addition=await storage.putLegacyAndMigrate(make([...newer,newCourse],"6"),profile);
      const addedCount=(await repo.readActiveBundle()).model.courses.length;
      const addedOccurrences=(await TimetableStorage.activeDataset()).__effectiveOccurrences.length;
      if(addition.mergeResult.newCourses!==1||addedCount!==3||addedOccurrences!==6)throw Error("NEW_SOURCE_COURSE_FAILED");
      const addedDataset=await TimetableStorage.activeDataset(),addedIcs=await TimetableIcs.generateFromEffective(addedDataset,addedDataset.__effectiveOccurrences,addedDataset.__runtimeProfile);
      const addedUids=addedIcs.ics.match(/UID:[^\r\n]+/g);
      if(addedIcs.generatedEvents!==6||!firstUid.every(uid=>addedUids.includes(uid)))throw Error("ADDED_OCCURRENCE_UID_FAILED");
      const beforeMissingReview=(await snapshots()).length;
      let missingReview=null;try{await storage.putLegacyAndMigrate(make([newer[0],newCourse],"7"),profile,indexedDB,{requireSourceMissingReview:true})}catch(error){missingReview=error.mergeResult||null}
      if(missingReview?.sourceMissingCourses!==1||missingReview.sourceMissingItems?.[0]?.courseTitle!=="Course B"||(await snapshots()).length!==beforeMissingReview)throw Error("SOURCE_MISSING_PRECOMMIT_REVIEW_FAILED");
      const removal=await storage.putLegacyAndMigrate(make([newer[0],newCourse],"7"),profile,indexedDB,{requireSourceMissingReview:true,sourceMissingApproved:true});
      const archived=(await raw()).find(x=>x.title==="Course B");
      if(!archived?.sourceMissing||!archived?.suppressed||removal.mergeResult.sourceMissingCourses!==1)throw Error("SOURCE_MISSING_ARCHIVE_FAILED");
      const remainingDataset=await TimetableStorage.activeDataset(),remainingIcs=await TimetableIcs.generateFromEffective(remainingDataset,remainingDataset.__effectiveOccurrences,remainingDataset.__runtimeProfile);
      const remainingUids=remainingIcs.ics.match(/UID:[^\r\n]+/g);
      if(remainingIcs.generatedEvents!==4||remainingUids.some(uid=>!addedUids.includes(uid)))throw Error("REMOVED_OCCURRENCE_UID_FAILED");
      const active=await repo.getActiveTimetable();
      const manual=await repo.createManualCourse(active.timetableId,{title:"Manual Course",teacher:"Teacher M",location:"Building M101",notes:"",weekday:4,weeks:[1],startPeriod:1,endPeriod:2});
      const manualBefore=(await raw()).find(row=>row.courseId===manual.courseId);
      await storage.putLegacyAndMigrate(make([{...newer[0],teacher:"Teacher After Manual"},newCourse],"8"),profile);
      const manualAfter=(await raw()).find(row=>row.courseId===manual.courseId);
      if(JSON.stringify(manualBefore)!==JSON.stringify(manualAfter)||manualAfter.sourceMissing)throw Error("MANUAL_COURSE_CHANGED_BY_REIMPORT");
      const history=await snapshots();
      if(!history.some(row=>row.mergeResult?.sourceUpdatedCourses===1)||history.length<2)throw Error("MERGE_HISTORY_MISSING");
      return {autoUpdate:auto.mergeResult.sourceUpdatedCourses,conflict:conflict.conflicts[0].type,rollback:beforeSnapshots===afterConflict,keepMine:keptOverride.fields.title,adoptSource:adopt.mergeResult.requiresReview===false,uidStable:JSON.stringify(firstUid)===JSON.stringify(afterUid),failureInjection:injected,newCourseCount:addedCount,newOccurrenceCount:addedOccurrences,newIcsEvents:addedIcs.generatedEvents,sourceMissing:archived.sourceMissing,remainingIcsEvents:remainingIcs.generatedEvents,manualPreserved:true,snapshotCount:(await snapshots()).length,activeCourses:(await repo.readActiveBundle()).model.courses.length};
    });
    assert.equal(result.rollback,true);console.log(JSON.stringify(result));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
