"use strict";
const assert = require("node:assert/strict");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const {chromium} = require("playwright");
const site = path.resolve(__dirname,"../app");
const executablePath = [path.join(process.env.LOCALAPPDATA || "","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"] || "","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const server = http.createServer((req,res) => {
  let pathname = decodeURIComponent(new URL(req.url,"http://local").pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(site,"."+pathname);
  if (!file.startsWith(site) || !fs.existsSync(file)) {res.writeHead(404);res.end("not found");return;}
  res.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":"text/html","cache-control":"no-store"});
  res.end(fs.readFileSync(file));
});
const listen = () => new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
(async () => {
  await listen();
  const browser = await chromium.launch({executablePath,headless:true,args:["--disable-background-networking"]});
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/about/`);
    for (const name of ["school-profile","school-config","phaseb-engine","course-model","course-resolver","effective-occurrences","ics-generator","schema4-plan","storage-v2","timetable-repository","session-grouping","storage"]) await page.addScriptTag({url:`/assets/timetable/${name}.js`});
    const result = await page.evaluate(async () => {
      const req = value => new Promise((resolve,reject) => {value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);});
      const txDone = value => new Promise((resolve,reject) => {value.oncomplete=resolve;value.onabort=value.onerror=()=>reject(value.error);});
      const profile = AnyClassSchoolProfileRegistry.get("school-demo");
      const fixture = term => ({key:`school-demo:2026-2027:${term}`,school:{id:"school-demo",name:"Example University",sourceSystem:"zhengfang-v9"},semester:{academicYear:"2026-2027",term},importedAt:"2026-09-01T00:00:00.000Z",fingerprint:`demo-${term}`,meetings:[{courseName:"Course A",teacher:"Teacher A",locationRaw:"Building A101",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2]}]});
      await req(indexedDB.deleteDatabase("course-app"));
      const legacy=fixture("1"),graph=AnyClassPhaseB.convertV1Dataset(legacy,profile,legacy.importedAt);
      const db=await new Promise((resolve,reject)=>{const open=indexedDB.open("course-app",2);open.onupgradeneeded=()=>{
        const d=open.result;d.createObjectStore("timetables",{keyPath:"key"});d.createObjectStore("v2Timetables",{keyPath:"timetableId"});
        const terms=d.createObjectStore("terms",{keyPath:"termId"});terms.createIndex("timetableId","timetableId");
        const meetings=d.createObjectStore("baseMeetings",{keyPath:"baseMeetingId"});meetings.createIndex("termId","termId");
        d.createObjectStore("v1Snapshots",{keyPath:"snapshotId"});d.createObjectStore("v2Migrations",{keyPath:"migrationId"});
      };open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
      const tx=db.transaction([...db.objectStoreNames],"readwrite");
      tx.objectStore("timetables").put(legacy);tx.objectStore("v2Timetables").put(graph.timetable);tx.objectStore("terms").put(graph.term);
      for (const row of graph.baseMeetings) tx.objectStore("baseMeetings").put(row);
      tx.objectStore("v1Snapshots").put({snapshotId:`v1:${legacy.key}`,sourceKey:legacy.key,dataset:legacy});
      const canonical=AnyClassPhaseB.canonical({key:legacy.key,school:legacy.school,semester:legacy.semester,meetings:legacy.meetings,fingerprint:legacy.fingerprint});
      tx.objectStore("v2Migrations").put({migrationId:`v1-to-v2:${legacy.key}`,sourceCanonical:canonical,meetingCount:1,status:"VERIFIED"});
      await txDone(tx);db.close();
      const upgraded=await AnyClassStorageV2.openDb();
      const version=upgraded.version,stores=[...upgraded.objectStoreNames];
      const indexTx=upgraded.transaction(["v2Timetables","terms","courses","importSnapshots","scheduleOverrides"]);
      const indexes={tables:[...indexTx.objectStore("v2Timetables").indexNames],terms:[...indexTx.objectStore("terms").indexNames],courses:[...indexTx.objectStore("courses").indexNames],snapshots:[...indexTx.objectStore("importSnapshots").indexNames],schedule:[...indexTx.objectStore("scheduleOverrides").indexNames]};
      upgraded.close();
      const repo=AnyClassTimetableRepository;
      const first=await repo.getActiveTimetable();
      const firstBundle=await repo.readActiveBundle();
      const firstCourseId=firstBundle.model.courses[0].courseId;
      const firstSourceRaw=firstBundle.model.courses[0].sourceRaw.locationRaw;
      const firstActiveDataset=await TimetableStorage.activeDataset();
      const baselineModel=AnyClassCourseModel.build(legacy,graph);
      const baselineEffective=AnyClassEffectiveOccurrences.build({...baselineModel,snapshots:[baselineModel.snapshot],courseOverrides:[],occurrenceOverrides:[],scheduleOverrides:[]},{semesterStartDate:graph.term.semesterStartDate,timezone:graph.term.timezone,periodTimes:graph.term.periodTimes});
      const baselineIcs=await TimetableIcs.generateFromEffective(legacy,baselineEffective,profile,{now:new Date("2026-09-01T00:00:00.000Z")});
      const migratedIcs=await TimetableIcs.generateFromEffective(firstActiveDataset,firstActiveDataset.__effectiveOccurrences,firstActiveDataset.__runtimeProfile,{now:new Date("2026-09-01T00:00:00.000Z")});
      const uid=value=>[...value.ics.matchAll(/(?:^|\r\n)UID:([^\r\n]+)/g)].map(match=>match[1]);
      const icsUidOrderEqual=JSON.stringify(uid(baselineIcs))===JSON.stringify(uid(migratedIcs));
      const oldId=first.timetableId;
      const second=fixture("2");
      await AnyClassStorageV2.putLegacyAndMigrate({...second,source:"file"},profile);
      const afterSecond=await repo.listTimetables(),activeUnchanged=(await repo.getActiveTimetable()).timetableId===oldId;
      const secondTable=afterSecond.find(row=>row.timetableId!==oldId);
      await AnyClassStorageV2.putLegacyAndMigrate(second,profile);
      const afterReimport=await repo.listTimetables();
      const oldBundle=await repo.readTimetableBundle(oldId),secondBundle=await repo.readTimetableBundle(afterSecond.find(row=>row.timetableId!==oldId).timetableId);
      localStorage.setItem("anyclass.periodPreferences.v1","synthetic-preserve");
      const damaged={...oldBundle.model.courses[0],sourceSnapshotId:secondBundle.model.snapshots[0].snapshotId};
      const damageDb=await AnyClassStorageV2.openDb(),damageTx=damageDb.transaction("courses","readwrite");damageTx.objectStore("courses").put(damaged);await txDone(damageTx);damageDb.close();
      let ambiguousDeleteRejected=false;
      try {await repo.deleteTimetable(oldId);} catch(error) {ambiguousDeleteRejected=/COURSE_OWNER_AMBIGUOUS/.test(error.message);}
      const oldSurvived=Boolean(await repo.getTimetable(oldId));
      const repairDb=await AnyClassStorageV2.openDb(),repairTx=repairDb.transaction("courses","readwrite");repairTx.objectStore("courses").put(oldBundle.model.courses[0]);await txDone(repairTx);repairDb.close();
      const renamed=await repo.renameTimetable(secondTable.timetableId,"Second term");
      const afterRename=await repo.getTimetable(secondTable.timetableId);
      await repo.setActiveTimetable(secondTable.timetableId);
      const activeSecond=await TimetableStorage.activeDataset();
      const dbReload=await AnyClassStorageV2.openDb();dbReload.close();
      const persisted=(await repo.getActiveTimetable()).timetableId===secondTable.timetableId;
      await repo.deleteTimetable(oldId);
      const afterInactiveDelete=await repo.listTimetables();
      const activeAfterInactive=(await repo.getActiveTimetable()).timetableId;
      const retainedBundle=await repo.readActiveBundle();
      await repo.deleteTimetable(secondTable.timetableId);
      const finalActive=await repo.getActiveTimetable(),finalTables=await repo.listTimetables();
      const globalPreferencesPreserved=localStorage.getItem("anyclass.periodPreferences.v1")==="synthetic-preserve";
      const manual=await repo.createTimetable({label:"Manual",routingKey:"manual:synthetic"});
      const manualActive=(await repo.getActiveTimetable()).timetableId===manual.timetableId;
      const another=await repo.createTimetable({label:"Another"});
      let duplicateRejected=false,invalidSelectionRejected=false;
      try {await repo.createTimetable({label:"Duplicate",routingKey:"manual:synthetic"});} catch(error) {duplicateRejected=/ROUTING_KEY_EXISTS/.test(error.message);}
      try {await repo.setActiveTimetable("missing");} catch(error) {invalidSelectionRejected=/TIMETABLE_NOT_FOUND/.test(error.message);}
      await repo.deleteTimetable(manual.timetableId);
      const replacementActive=(await repo.getActiveTimetable()).timetableId===another.timetableId;
      await repo.deleteTimetable(another.timetableId);
      return {version,stores,indexes,firstCourseId,expectedCourseId:AnyClassCourseModel.build(legacy,graph).courses[0].courseId,firstSourceRaw,firstEffective:firstActiveDataset.__effectiveOccurrences.length,icsUidOrderEqual,icsEvents:migratedIcs.generatedEvents,afterSecond:afterSecond.length,activeUnchanged,afterReimport:afterReimport.length,ambiguousDeleteRejected,oldSurvived,renameIdStable:renamed.timetableId===afterRename.timetableId,renameRoutingStable:renamed.routingKey===secondTable.routingKey,persisted,activeSecondTerm:activeSecond.semester.term,afterInactiveDelete:afterInactiveDelete.length,activeAfterInactive,retainedCourses:retainedBundle.model.courses.length,retainedSnapshots:retainedBundle.model.snapshots.length,secondId:secondTable.timetableId,finalActive,finalTables:finalTables.length,globalPreferencesPreserved,manualActive,duplicateRejected,invalidSelectionRejected,replacementActive};
    });
    assert.equal(result.version,4);assert(result.stores.includes("appState"));
    for (const [store,index] of [["tables","routingKey"],["terms","timetableId"],["courses","timetableId"],["snapshots","timetableId"],["schedule","timetableId"]]) assert(result.indexes[store].includes(index),`${store}.${index}`);
    assert.equal(result.firstCourseId,result.expectedCourseId);assert.equal(result.firstSourceRaw,"Building A101");assert.equal(result.firstEffective,2);assert(result.icsUidOrderEqual);assert.equal(result.icsEvents,2);
    assert.equal(result.afterSecond,2);assert(result.activeUnchanged);assert.equal(result.afterReimport,2);assert(result.ambiguousDeleteRejected);assert(result.oldSurvived);
    assert(result.renameIdStable);assert(result.renameRoutingStable);assert(result.persisted);assert.equal(result.activeSecondTerm,"2");
    assert.equal(result.afterInactiveDelete,1);assert.equal(result.activeAfterInactive,result.secondId);assert.equal(result.retainedCourses,1);assert(result.retainedSnapshots>=1);assert.equal(result.finalTables,0);assert.equal(result.finalActive,null);
    assert(result.manualActive);assert(result.duplicateRejected);assert(result.invalidSelectionRejected);assert(result.replacementActive);assert(result.globalPreferencesPreserved);
    const direct = await page.evaluate(async () => {
      const req = value => new Promise((resolve,reject) => {value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);});
      const completed = tx => new Promise((resolve,reject) => {tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
      await req(indexedDB.deleteDatabase("course-app"));
      const profile=AnyClassSchoolProfileRegistry.get("school-demo");
      const dataset={key:"school-demo:2026-2027:1",school:{id:"school-demo",name:"Example University",sourceSystem:"zhengfang-v9"},semester:{academicYear:"2026-2027",term:"1"},importedAt:"2026-09-01T00:00:00.000Z",fingerprint:"direct-schema3",meetings:[{courseName:"Course A",teacher:"Teacher A",locationRaw:"Building A101",weekday:1,startPeriod:1,endPeriod:2,weeks:[1,2]}]};
      const graph=AnyClassPhaseB.convertV1Dataset(dataset,profile,dataset.importedAt),model=AnyClassCourseModel.build(dataset,graph);
      const db=await new Promise((resolve,reject)=>{const open=indexedDB.open("course-app",3);open.onupgradeneeded=()=>{
        const d=open.result;
        for (const [name,key] of [["timetables","key"],["v2Timetables","timetableId"],["terms","termId"],["baseMeetings","baseMeetingId"],["v1Snapshots","snapshotId"],["v2Migrations","migrationId"],["importSnapshots","snapshotId"],["courses","courseId"],["courseOverrides","courseId"],["occurrenceOverrides","occurrenceId"],["scheduleOverrides","scheduleOverrideId"],["schema3Migrations","migrationId"]]) d.createObjectStore(name,{keyPath:key});
        open.transaction.objectStore("terms").createIndex("timetableId","timetableId");open.transaction.objectStore("baseMeetings").createIndex("termId","termId");
        open.transaction.objectStore("importSnapshots").createIndex("sourceKey","sourceKey");open.transaction.objectStore("courses").createIndex("sourceKey","sourceKey");open.transaction.objectStore("courses").createIndex("sourceSnapshotId","sourceSnapshotId");open.transaction.objectStore("occurrenceOverrides").createIndex("courseId","courseId");
      };open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
      const tx=db.transaction([...db.objectStoreNames],"readwrite");
      tx.objectStore("timetables").put(dataset);tx.objectStore("v2Timetables").put(graph.timetable);tx.objectStore("terms").put(graph.term);
      tx.objectStore("baseMeetings").put(graph.baseMeetings[0]);tx.objectStore("importSnapshots").put(model.snapshot);tx.objectStore("courses").put(model.courses[0]);
      tx.objectStore("scheduleOverrides").put({scheduleOverrideId:"ownerless",kind:"synthetic"});
      await completed(tx);db.close();
      let rejected=false;
      try { const upgraded=await AnyClassStorageV2.openDb();upgraded.close(); } catch (error) { rejected=/SCHEDULE_OVERRIDE_OWNER_AMBIGUOUS/.test(error.message); }
      const stillV3=await req(indexedDB.open("course-app",3));const oldVersion=stillV3.version;
      const clean=stillV3.transaction("scheduleOverrides","readwrite");clean.objectStore("scheduleOverrides").delete("ownerless");await completed(clean);stillV3.close();
      let upgraded;
      try { upgraded=await AnyClassStorageV2.openDb(); } catch (error) { return {rejected,oldVersion,secondUpgradeError:error.message}; }
      const newVersion=upgraded.version;upgraded.close();
      const bundle=await AnyClassTimetableRepository.readActiveBundle();
      const keptId=bundle.model.courses[0].courseId===model.courses[0].courseId;
      const edit=await AnyClassStorageV2.openDb();const editTx=edit.transaction(["courses","courseOverrides","occurrenceOverrides"],"readwrite");
      const suppressed={...bundle.model.courses[0],courseId:"course:synthetic-suppressed",suppressed:true};
      editTx.objectStore("courses").put(suppressed);
      editTx.objectStore("courseOverrides").put({courseId:suppressed.courseId,fields:{color:"red"}});
      editTx.objectStore("occurrenceOverrides").put({occurrenceId:"occurrence:synthetic",courseId:suppressed.courseId,fields:{cancelled:true}});
      await completed(editTx);edit.close();
      await AnyClassTimetableRepository.deleteTimetable(bundle.table.timetableId);
      const readback=await AnyClassStorageV2.openDb();
      const counts={};for(const name of ["courses","courseOverrides","occurrenceOverrides","importSnapshots","baseMeetings","terms","v2Timetables"]) counts[name]=await req(readback.transaction(name).objectStore(name).count());
      readback.close();
      return {rejected,oldVersion,newVersion,keptId,counts};
    });
    assert.equal(direct.secondUpgradeError,undefined,direct.secondUpgradeError);assert(direct.rejected);assert.equal(direct.oldVersion,3);assert.equal(direct.newVersion,4);assert(direct.keptId);
    assert(Object.values(direct.counts).every(count=>count===0));
    const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.message));
    const routes=["/","/today/","/timetable/","/import/","/settings/timetable/","/local-status/","/export/"];
    for (const width of [390,430,1024]) for (const colorScheme of ["light","dark"]) {
      await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});
      for (const route of routes) {
        const response=await page.goto(`http://127.0.0.1:${server.address().port}${route}`);assert.equal(response.status(),200,route);
        const geometry=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
        assert(geometry.scroll<=geometry.client+1,`${route} ${width} ${colorScheme} overflow ${geometry.scroll}/${geometry.client}`);
      }
    }
    assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(" | ")}`);
    console.log(JSON.stringify({schema:4,schema2Upgrade:"PASS",schema3Upgrade:"PASS",ownerlessOverrideRollback:"PASS",courseIdentity:"PASS",sourceRaw:"PASS",effectiveOccurrences:2,icsEvents:2,icsUidOrder:"IDENTICAL",twoTerms:"PASS",sameTermReimport:"PASS",selectionPersistence:"PASS",rename:"PASS",deleteIsolation:"PASS",suppressedDeletion:"PASS",finalActiveNull:"PASS",pageSmoke:`${routes.length*6}/42 PASS`}));
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
