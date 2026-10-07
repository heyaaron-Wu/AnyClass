(function (root) {
  "use strict";

  const DB_NAME = "course-app", DB_VERSION = 4;
  const STORES = Object.freeze({legacy: "timetables", timetables: "v2Timetables", terms: "terms", baseMeetings: "baseMeetings", snapshots: "v1Snapshots", migrations: "v2Migrations", importSnapshots: "importSnapshots", courses: "courses", courseOverrides: "courseOverrides", occurrenceOverrides: "occurrenceOverrides", scheduleOverrides: "scheduleOverrides", schema3Migrations: "schema3Migrations", appState: "appState"});

  const requestValue = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_REQUEST_FAILED"));
  });
  const transactionDone = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_TRANSACTION_FAILED"));
    transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_TRANSACTION_ABORTED"));
  });

  const openDb = (factory = indexedDB) => new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    let upgradeError = null;
    request.onupgradeneeded = event => {
      const db = request.result;
      const upgrade = request.transaction;
      if (!db.objectStoreNames.contains(STORES.legacy)) db.createObjectStore(STORES.legacy, {keyPath: "key"});
      if (!db.objectStoreNames.contains(STORES.timetables)) db.createObjectStore(STORES.timetables, {keyPath: "timetableId"});
      if (!db.objectStoreNames.contains(STORES.terms)) {
        const store = db.createObjectStore(STORES.terms, {keyPath: "termId"});
        store.createIndex("timetableId", "timetableId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.baseMeetings)) {
        const store = db.createObjectStore(STORES.baseMeetings, {keyPath: "baseMeetingId"});
        store.createIndex("termId", "termId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.snapshots)) db.createObjectStore(STORES.snapshots, {keyPath: "snapshotId"});
      if (!db.objectStoreNames.contains(STORES.migrations)) db.createObjectStore(STORES.migrations, {keyPath: "migrationId"});
      if (!db.objectStoreNames.contains(STORES.importSnapshots)) {
        const store = db.createObjectStore(STORES.importSnapshots, {keyPath: "snapshotId"});
        store.createIndex("sourceKey", "sourceKey", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.courses)) {
        const store = db.createObjectStore(STORES.courses, {keyPath: "courseId"});
        store.createIndex("sourceKey", "sourceKey", {unique: false});
        store.createIndex("sourceSnapshotId", "sourceSnapshotId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.courseOverrides)) db.createObjectStore(STORES.courseOverrides, {keyPath: "courseId"});
      if (!db.objectStoreNames.contains(STORES.occurrenceOverrides)) {
        const store = db.createObjectStore(STORES.occurrenceOverrides, {keyPath: "occurrenceId"});
        store.createIndex("courseId", "courseId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.scheduleOverrides)) db.createObjectStore(STORES.scheduleOverrides, {keyPath: "scheduleOverrideId"});
      if (!db.objectStoreNames.contains(STORES.schema3Migrations)) db.createObjectStore(STORES.schema3Migrations, {keyPath: "migrationId"});
      if (!db.objectStoreNames.contains(STORES.appState)) db.createObjectStore(STORES.appState, {keyPath: "key"});
      const addIndex = (storeName, indexName, keyPath, unique = false) => {
        const store = upgrade.objectStore(storeName);
        if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, {unique});
      };
      addIndex(STORES.timetables, "routingKey", "routingKey", true);
      addIndex(STORES.courses, "timetableId", "timetableId");
      addIndex(STORES.importSnapshots, "timetableId", "timetableId");
      addIndex(STORES.scheduleOverrides, "timetableId", "timetableId");
      const names = Object.values(STORES).filter(name => name !== STORES.appState);
      const rows = {}, requests = names.map(name => [name, upgrade.objectStore(name).getAll()]);
      let remaining = requests.length;
      const abort = error => {
        upgradeError = error instanceof Error ? error : new Error("SCHEMA4_UPGRADE_FAILED");
        try { upgrade.abort(); } catch (_) {}
      };
      for (const [name, read] of requests) {
        read.onerror = () => abort(read.error);
        read.onsuccess = () => {
          rows[name] = read.result;
          if (--remaining) return;
          try {
            if (!root.AnyClassSchema4Plan) throw new Error("SCHEMA4_PLAN_REQUIRED");
            const plan = root.AnyClassSchema4Plan.plan(rows, event.oldVersion);
            for (const row of plan.baseMeetings || []) upgrade.objectStore(STORES.baseMeetings).put(row);
            for (const row of plan.v1Snapshots || []) upgrade.objectStore(STORES.snapshots).put(row);
            for (const row of plan.v2Migrations || []) upgrade.objectStore(STORES.migrations).put(row);
            for (const row of plan.timetables) upgrade.objectStore(STORES.timetables).put(row);
            for (const row of plan.terms) upgrade.objectStore(STORES.terms).put(row);
            for (const row of plan.importSnapshots) upgrade.objectStore(STORES.importSnapshots).put(row);
            for (const row of plan.courses) upgrade.objectStore(STORES.courses).put(row);
            for (const row of plan.schema3Migrations) upgrade.objectStore(STORES.schema3Migrations).put(row);
            upgrade.objectStore(STORES.appState).put({key: "activeTimetableId", value: plan.activeTimetableId});
            const expected = [[STORES.timetables,"timetableId",plan.timetables],[STORES.terms,"termId",plan.terms],[STORES.importSnapshots,"snapshotId",plan.importSnapshots],[STORES.courses,"courseId",plan.courses]];
            let pending = expected.length + 1;
            const found = new Map();
            const check = () => {
              if (--pending) return;
              try {
                for (const [name,key,planned] of expected) {
                  const rows = found.get(name);
                  if (rows.length !== planned.length) throw new Error("SCHEMA4_UPGRADE_READBACK_COUNT");
                  const actualIds = rows.map(row => `${row[key]}:${row.timetableId || ""}`).sort();
                  const expectedIds = planned.map(row => `${row[key]}:${row.timetableId || ""}`).sort();
                  if (root.AnyClassPhaseB.canonical(actualIds) !== root.AnyClassPhaseB.canonical(expectedIds)) throw new Error("SCHEMA4_UPGRADE_READBACK_OWNER");
                }
                if (found.get(STORES.appState)?.value !== plan.activeTimetableId) throw new Error("SCHEMA4_UPGRADE_READBACK_ACTIVE");
              } catch (error) { abort(error); }
            };
            for (const [name] of expected) {
              const readback = upgrade.objectStore(name).getAll();
              readback.onsuccess = () => { found.set(name,readback.result);check(); };
              readback.onerror = () => abort(readback.error);
            }
            const stateReadback = upgrade.objectStore(STORES.appState).get("activeTimetableId");
            stateReadback.onsuccess = () => { found.set(STORES.appState,stateReadback.result);check(); };
            stateReadback.onerror = () => abort(stateReadback.error);
          } catch (error) { abort(error); }
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(upgradeError || request.error || new Error("INDEXEDDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("INDEXEDDB_UPGRADE_BLOCKED"));
  });

  const canonicalLegacy = dataset => root.AnyClassPhaseB.canonical({
    key: dataset.key, school: dataset.school, semester: dataset.semester,
    meetings: dataset.meetings, fingerprint: dataset.fingerprint || null
  });

  const schema3Model = (dataset, graph) => {
    if (!root.AnyClassCourseModel) throw new Error("COURSE_MODEL_REQUIRED");
    return root.AnyClassCourseModel.build(dataset, graph);
  };

  const writeSchema3 = async (transaction, dataset, graph, review = {}) => {
    const model = schema3Model(dataset, graph), sourceCanonical = canonicalLegacy(dataset);
    const migrationId = `v2-to-v3:${model.snapshot.sourceKey}`;
    const courses = transaction.objectStore(STORES.courses);
    const previous = await requestValue(courses.index("sourceKey").getAll(model.snapshot.sourceKey));
    if (previous.some(item => item.timetableId !== graph.timetable.timetableId)) throw new Error("SOURCE_KEY_CROSS_TIMETABLE");
    const previousSnapshots = await requestValue(transaction.objectStore(STORES.importSnapshots).index("sourceKey").getAll(model.snapshot.sourceKey));
    if (previousSnapshots.some(item => item.timetableId !== graph.timetable.timetableId)) throw new Error("SOURCE_SNAPSHOT_CROSS_TIMETABLE");
    const allCourses=await requestValue(courses.index("timetableId").getAll(graph.timetable.timetableId));
    const courseOverrides=await requestValue(transaction.objectStore(STORES.courseOverrides).getAll());
    const occurrenceOverrides=await requestValue(transaction.objectStore(STORES.occurrenceOverrides).getAll());
    const ownedGroups=(await requestValue(transaction.objectStore(STORES.scheduleOverrides).index("timetableId").getAll(graph.timetable.timetableId))).filter(row=>row.kind==="session-group");
    let plan=null;
    if(previous.length){
      const snapshotIds=new Set(previousSnapshots.map(row=>row.snapshotId));
      if(previous.some(row=>!snapshotIds.has(row.sourceSnapshotId)))throw Error("MERGE_PREVIOUS_SOURCE_SNAPSHOT_MISSING");
      const input={timetableId:graph.timetable.timetableId,sourceKey:model.snapshot.sourceKey,previous,incoming:model.courses.map(item=>({...item,timetableId:graph.timetable.timetableId})),courseOverrides:courseOverrides.filter(row=>allCourses.some(item=>item.courseId===row.courseId)),occurrenceOverrides:occurrenceOverrides.filter(row=>allCourses.some(item=>item.courseId===row.courseId)),groups:ownedGroups,otherCourses:allCourses.filter(item=>item.sourceKey!==model.snapshot.sourceKey),term:graph.term,completeness:dataset.completeness||"UNKNOWN"};
      const stableReviewValue=value=>Array.isArray(value)?value.map(stableReviewValue):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([key])=>!["createdAt","updatedAt","importedAt","capturedAt"].includes(key)).map(([key,item])=>[key,stableReviewValue(item)])):value;
      const reviewBasis=root.AnyClassPhaseB.canonical(stableReviewValue([input.previous,input.incoming,input.courseOverrides,input.occurrenceOverrides,input.groups,input.term]));
      let reviewHash=0xcbf29ce484222325n;for(let index=0;index<reviewBasis.length;index++)reviewHash=BigInt.asUintN(64,(reviewHash^BigInt(reviewBasis.charCodeAt(index)))*0x100000001b3n);
      const reviewSignature=reviewHash.toString(16).padStart(16,"0");
      if(review.expectedReviewSignature&&review.expectedReviewSignature!==reviewSignature)throw Error("REIMPORT_REVIEW_STALE");
      plan=planReimport({...input,resolutions:review.mergeResolutions||{}});
      plan.result.reviewSignature=reviewSignature;
      if(plan.result.requiresReview||(review.requireSourceMissingReview&&plan.result.sourceMissingCourses&&!review.sourceMissingApproved)){const error=Error("REIMPORT_MERGE_REVIEW_REQUIRED");error.mergeResult=plan.result;throw error;}
    }
    const proposed=(plan?.courses||model.courses).filter(row=>row.suppressed!==true);
    const retained=allCourses.filter(row=>row.suppressed!==true&&row.sourceKey!==model.snapshot.sourceKey);
    const effectiveOverrides=new Map(courseOverrides.map(row=>[row.courseId,row.fields||{}]));
    for(const update of plan?.courseOverrideUpdates||[])if(update.remove)effectiveOverrides.delete(update.courseId);else effectiveOverrides.set(update.courseId,update.fields||{});
    const proposedIds=new Set(proposed.map(row=>row.courseId));
    const nameConflicts=root.AnyClassCourseModel.nameConflicts([...retained,...proposed].map(row=>({...row,...(effectiveOverrides.get(row.courseId)||{})}))).filter(item=>proposedIds.has(item.first.courseId)||proposedIds.has(item.second.courseId));
    if(nameConflicts.length){const error=Error("LOGICAL_COURSE_NAME_CONFLICT");error.count=nameConflicts.length;throw error;}
    for (const item of plan?.archived||[]) courses.put(item);
    transaction.objectStore(STORES.importSnapshots).put({...model.snapshot, timetableId:graph.timetable.timetableId,...(plan?{mergeResult:plan.result}:{})});
    for (const course of plan?.courses||model.courses) courses.put({...course, timetableId:graph.timetable.timetableId});
    for (const update of plan?.courseOverrideUpdates||[]) if(update.remove)transaction.objectStore(STORES.courseOverrides).delete(update.courseId);else transaction.objectStore(STORES.courseOverrides).put(update);
    transaction.objectStore(STORES.schema3Migrations).put({migrationId, modelVersion: root.AnyClassCourseModel.COURSE_MODEL_VERSION, status: "VERIFIED", sourceKey: model.snapshot.sourceKey, sourceCanonical, snapshotId: model.snapshot.snapshotId, courseCount: model.courses.length, mergeResult:plan?.result||null, updatedAt: new Date().toISOString()});
    return {...model,mergeResult:plan?.result||null};
  };

  const migrateDataset = (dataset, config, factory = indexedDB, hooks = {}) => persistDataset(dataset, config, factory, hooks, false);

  const readGraph = async (timetableId, factory = indexedDB) => {
    const db = await openDb(factory);
    try {
      const timetable = await requestValue(db.transaction(STORES.timetables, "readonly").objectStore(STORES.timetables).get(timetableId));
      if (!timetable) return null;
      const term = await requestValue(db.transaction(STORES.terms, "readonly").objectStore(STORES.terms).get(timetable.activeTermId));
      if (!term || term.timetableId !== timetableId) throw new Error("ACTIVE_TERM_MISSING_OR_FOREIGN");
      const baseMeetings = await requestValue(db.transaction(STORES.baseMeetings, "readonly").objectStore(STORES.baseMeetings).index("termId").getAll(term.termId));
      return {schemaVersion: 2, timetable, term, baseMeetings};
    } finally { db.close(); }
  };

  const readCourseModel = async (sourceKey, factory = indexedDB) => {
    const db = await openDb(factory);
    try {
      const transaction = db.transaction([STORES.importSnapshots, STORES.courses, STORES.courseOverrides, STORES.occurrenceOverrides, STORES.scheduleOverrides], "readonly");
      const snapshots = await requestValue(transaction.objectStore(STORES.importSnapshots).index("sourceKey").getAll(sourceKey));
      const courses = (await requestValue(transaction.objectStore(STORES.courses).index("sourceKey").getAll(sourceKey))).filter(item => item.suppressed !== true);
      const courseOverrides = await requestValue(transaction.objectStore(STORES.courseOverrides).getAll());
      const occurrenceOverrides = await requestValue(transaction.objectStore(STORES.occurrenceOverrides).getAll());
      const owners = new Set(courses.map(item => item.timetableId));
      if (owners.size > 1 || snapshots.some(item => !owners.has(item.timetableId))) throw new Error("COURSE_MODEL_OWNER_CONFLICT");
      const scheduleOverrides = owners.size ? await requestValue(transaction.objectStore(STORES.scheduleOverrides).index("timetableId").getAll([...owners][0])) : [];
      return {schemaVersion: 3, snapshots, courses, courseOverrides: courseOverrides.filter(item => courses.some(course => course.courseId === item.courseId)), occurrenceOverrides: occurrenceOverrides.filter(item => courses.some(course => course.courseId === item.courseId)), scheduleOverrides};
    } finally { db.close(); }
  };

  const verifySchema3 = async (dataset, graph, factory = indexedDB) => {
    const expected = schema3Model(dataset, graph), actual = await readCourseModel(expected.snapshot.sourceKey, factory);
    const ordered = value => [...value].sort((a, b) => a.courseId.localeCompare(b.courseId));
    const active = actual.courses.filter(item => item.suppressed !== true);
    const owned = expected.courses.map(item => ({...item,timetableId:graph.timetable.timetableId}));
    const withoutUidSeed=rows=>ordered(rows).map(({uidIdentitySeed,sourceMissing,...rest})=>rest);
    if (!actual.snapshots.some(item => item.snapshotId === expected.snapshot.snapshotId && item.timetableId === graph.timetable.timetableId) || active.length !== owned.length || root.AnyClassPhaseB.canonical(withoutUidSeed(active)) !== root.AnyClassPhaseB.canonical(withoutUidSeed(owned))) throw new Error("SCHEMA3_MIGRATION_READBACK_FAILED");
    return actual;
  };

  const latestLegacyDataset = async (schoolId, factory = indexedDB) => {
    const db = await openDb(factory);
    try {
      const rows = await requestValue(db.transaction(STORES.legacy, "readonly").objectStore(STORES.legacy).getAll());
      return rows.filter(item => item && item.school && item.school.id === schoolId).sort((a, b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")))[0] || null;
    } finally { db.close(); }
  };

  const getLegacyDataset = async (key, factory = indexedDB) => {
    const db = await openDb(factory);
    try { return await requestValue(db.transaction(STORES.legacy, "readonly").objectStore(STORES.legacy).get(key)) || null; }
    finally { db.close(); }
  };

  const countLegacyKey = async (key, factory = indexedDB) => {
    const db = await openDb(factory);
    try { return await requestValue(db.transaction(STORES.legacy, "readonly").objectStore(STORES.legacy).count(key)); }
    finally { db.close(); }
  };

  const ensureLatest = async (schoolId, config, factory = indexedDB) => {
    const active = await root.AnyClassTimetableRepository.getActiveTimetable(factory);
    if (!active) return null;
    const bundle = await root.AnyClassTimetableRepository.readTimetableBundle(active.timetableId,factory);
    return bundle?.dataset ? {dataset:bundle.dataset,graph:{schemaVersion:2,timetable:bundle.table,term:bundle.term,baseMeetings:bundle.meetings}} : null;
  };

  // Plan against immutable source Courses and sparse user intent, never against rendered occurrences.
  // A plan requiring review is returned without applying any writes to the transaction.
  const planReimport = ({timetableId,sourceKey,previous,incoming,courseOverrides=[],occurrenceOverrides=[],groups=[],otherCourses=[],term,completeness,resolutions={}}) => {
    const oldById=new Map(previous.map(row=>[row.courseId,row]));
    const newById=new Map(incoming.map(row=>[row.courseId,row]));
    if(oldById.size!==previous.length||newById.size!==incoming.length)throw Error("MERGE_DUPLICATE_SOURCE_IDENTITY");
    const same=(a,b)=>root.AnyClassPhaseB.canonical(a)===root.AnyClassPhaseB.canonical(b);
    const editable=root.AnyClassCourseEditing?.editable || ["title","teacher","location","weekday","weeks","startPeriod","endPeriod","notes"];
    const fieldValue=(row,field)=>field==="weeks"?[...(row[field]||[])].sort((a,b)=>a-b):["title","teacher","location","notes"].includes(field)?String(row[field]??"").trim():row[field];
    const result={status:"MERGED",unchangedCourses:0,sourceUpdatedCourses:0,newCourses:0,sourceMissingCourses:0,sourceMissingItems:[],preservedCourseOverrides:0,preservedOccurrenceOverrides:0,preservedCancellations:0,preservedGroupings:0,conflicts:[],orphanedOccurrenceOverrides:[],invalidatedGroupings:[],requiresReview:false};
    const updatedOverrides=[],merged=[];
    const overrideById=new Map(courseOverrides.map(row=>[row.courseId,row]));
    for(const next of incoming){
      const prior=oldById.get(next.courseId);
      if(!prior){result.newCourses++;merged.push(next);continue;}
      if(prior.sourceKey!==sourceKey||prior.timetableId!==timetableId)throw Error("MERGE_SOURCE_OWNER_CONFLICT");
      const sourceChanged=editable.some(field=>!same(fieldValue(prior,field),fieldValue(next,field)))||!same(prior.sourceRaw,next.sourceRaw);
      if(sourceChanged)result.sourceUpdatedCourses++;else result.unchangedCourses++;
      merged.push({...next,uidIdentitySeed:prior.uidIdentitySeed||{courseName:prior.title,weekday:prior.weekday,startPeriod:prior.startPeriod,endPeriod:prior.endPeriod,locationRaw:prior.location||""},sourceMissing:false,suppressed:false});
      const override=overrideById.get(next.courseId);
      if(!override)continue;
      const fields={...override.fields};
      for(const field of Object.keys(fields)){
        if(!editable.includes(field)||same(fieldValue(prior,field),fieldValue(next,field)))continue;
        if(same(fieldValue(fields,field),fieldValue(next,field))){delete fields[field];continue;}
        const choice=resolutions[`${next.courseId}:${field}`];
        if(choice==="ADOPT_SOURCE")delete fields[field];
        else if(choice!=="KEEP_MINE")result.conflicts.push({type:"FIELD_CONFLICT",timetableId,courseId:next.courseId,courseTitle:next.title,sourceIdentity:next.sourceMeetingId,field,previousSourceValue:prior[field]??null,currentUserValue:fields[field],newSourceValue:next[field]??null});
      }
      if(Object.keys(fields).length){updatedOverrides.push({...override,fields});result.preservedCourseOverrides++;}
      else updatedOverrides.push({courseId:override.courseId,remove:true});
    }
    const missing=previous.filter(row=>!newById.has(row.courseId)&&row.sourceMissing!==true);
    if(missing.length&&completeness!=="COMPLETE")result.conflicts.push({type:"SOURCE_COMPLETENESS_UNKNOWN",timetableId,sourceKey,missingCourseIds:missing.map(row=>row.courseId)});
    if(missing.some(row=>!row.sourceRaw?.sourceTeachingClassId&&!row.sourceRaw?.teachingClassId)&&result.newCourses)result.conflicts.push({type:"UNTRUSTED_SOURCE_REBIND_REVIEW",timetableId,sourceKey,missingCourseIds:missing.map(row=>row.courseId)});
    for(const prior of missing){
      result.sourceMissingCourses++;
      result.sourceMissingItems.push({courseId:prior.courseId,courseTitle:prior.title,hasUserChanges:overrideById.has(prior.courseId)||occurrenceOverrides.some(row=>row.courseId===prior.courseId)});
      const trusted=prior.sourceRaw?.sourceTeachingClassId||prior.sourceRaw?.teachingClassId;
      if(trusted&&incoming.some(next=>(next.sourceRaw?.sourceTeachingClassId||next.sourceRaw?.teachingClassId)===trusted))result.conflicts.push({type:"SOURCE_SLOT_REBIND_REVIEW",timetableId,courseId:prior.courseId,sourceIdentity:trusted});
      const potential=incoming.filter(next=>next.weekday===prior.weekday&&next.startPeriod===prior.startPeriod&&next.endPeriod===prior.endPeriod&&same(next.weeks,prior.weeks));
      if(potential.length)result.conflicts.push({type:"SOURCE_IDENTITY_AMBIGUOUS",timetableId,courseId:prior.courseId,sourceIdentity:prior.sourceMeetingId,candidateCourseIds:potential.map(row=>row.courseId)});
    }
    const archived=missing.map(row=>({...row,sourceMissing:true,suppressed:true}));
    const retainedMissing=previous.filter(row=>row.sourceMissing===true&&!newById.has(row.courseId));
    const proposed=[...otherCourses,...merged,...archived,...retainedMissing];
    const proposedOverrides=courseOverrides.filter(row=>!newById.has(row.courseId)).concat(updatedOverrides.filter(row=>!row.remove));
    const context={semesterStartDate:term.semesterStartDate,timezone:term.timezone,periodTimes:term.periodTimes,timingStatus:term.timingStatus};
    const occurrenceContext=row=>{const prior=oldById.get(row.courseId);if(!prior||!term.semesterStartDate)return{};for(const week of prior.weeks||[]){const date=new Date(`${term.semesterStartDate}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+(week-1)*7+prior.weekday-1);const nominalDate=date.toISOString().slice(0,10);if(`occurrence:${root.AnyClassPhaseB.idComponent([prior.sourceMeetingId,nominalDate])}`===row.occurrenceId)return{nominalDate,week};}return{};};
    if(root.AnyClassEffectiveOccurrences){
      try{
        root.AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:proposed,courseOverrides:proposedOverrides,occurrenceOverrides,scheduleOverrides:[]},context);
      }catch(error){
        if(error.message==="ORPHANED_OCCURRENCE_OVERRIDE"){
          for(const row of occurrenceOverrides)if(newById.has(row.courseId))result.orphanedOccurrenceOverrides.push({type:"ORPHANED_OCCURRENCE_OVERRIDE",timetableId,courseId:row.courseId,occurrenceId:row.occurrenceId,courseTitle:oldById.get(row.courseId)?.title||newById.get(row.courseId)?.title,...occurrenceContext(row),modifiedDate:row.fields?.effectiveDate||null,modifiedStartPeriod:row.fields?.startPeriod||null,modifiedEndPeriod:row.fields?.endPeriod||null});
        }else result.conflicts.push({type:"EFFECTIVE_OCCURRENCE_REVIEW",timetableId,reason:error.message});
      }
    }
    result.preservedOccurrenceOverrides=occurrenceOverrides.length;
    result.preservedCancellations=occurrenceOverrides.filter(row=>row.fields?.cancelled===true).length;
    if(groups.length){
      try{root.AnyClassSessionGrouping.validate({courses:proposed,courseOverrides:proposedOverrides,occurrenceOverrides,scheduleOverrides:groups},term,timetableId);result.preservedGroupings=groups.length;}
      catch(error){result.invalidatedGroupings.push({type:"GROUPING_REVIEW",timetableId,groupingIds:groups.map(row=>row.groupingId),reason:error.message});}
    }
    result.requiresReview=Boolean(result.conflicts.length||result.orphanedOccurrenceOverrides.length||result.invalidatedGroupings.length);
    return {result,courses:merged,archived,courseOverrideUpdates:updatedOverrides};
  };

  const persistDataset = async (dataset, config, factory = indexedDB, hooks = {}, writeLegacy = true) => {
    if (!root.AnyClassPhaseB) throw new Error("PHASE_B_ENGINE_REQUIRED");
    const missingSchoolId = dataset.school?.id == null;
    const newLocalTarget = missingSchoolId && !hooks.targetTimetableId;
    const targetId = hooks.targetTimetableId || (newLocalTarget ? `timetable:user:${crypto.randomUUID()}` : null);
    let scopedTarget = false;
    if (targetId) {
      const adapterId = config.snapshot?.(0)?.adapterId || config.adapterId;
      if (!adapterId) throw new Error("TARGETED_IMPORT_ADAPTER_REQUIRED");
      const sourceRoute = missingSchoolId ? null : root.AnyClassSchema4Plan.academicRoutingKey(adapterId,dataset.school.id,dataset.semester.academicYear,dataset.semester.term);
      const inspection = await openDb(factory);
      try {
        const tx = inspection.transaction([STORES.timetables,STORES.terms],"readonly"),tables = tx.objectStore(STORES.timetables);
        const target = await requestValue(tables.get(targetId));
        if (!target && !newLocalTarget) throw new Error("IMPORT_TARGET_MISSING");
        scopedTarget = missingSchoolId || target?.routingKey !== sourceRoute;
        if (missingSchoolId && target?.activeTermId) {
          const term = await requestValue(tx.objectStore(STORES.terms).get(target.activeTermId));
          if (term?.academicYear === dataset.semester.academicYear && String(term.termCode) === String(dataset.semester.term)) config = {...config,termIdOverride:term.termId};
        }
      } finally { inspection.close(); }
      if (scopedTarget) {
        // The selected local workspace owns independent source, term, meeting and course IDs.
        // Keep the original route-owned timetable's IDs unchanged for existing reimports.
        const localKey = missingSchoolId
          ? `local:${root.AnyClassPhaseB.idComponent([targetId,dataset.semester.academicYear,dataset.semester.term])}`
          : `local:${root.AnyClassPhaseB.idComponent([targetId,dataset.key])}`;
        dataset = {...dataset,key:localKey};
        config = {...config,identityScope:targetId};
      }
    }
    const graph = root.AnyClassPhaseB.convertV1Dataset(dataset, config);
    if (graph.baseMeetings.length !== dataset.meetings.length) throw new Error("MIGRATION_COUNT_MISMATCH");
    const route = missingSchoolId ? `local:${targetId}` : root.AnyClassSchema4Plan.academicRoutingKey(graph.term.schoolProfileSnapshot.adapterId,dataset.school.id,dataset.semester.academicYear,dataset.semester.term);
    const migrationId = `v1-to-v2:${dataset.key}`, snapshotId = `v1:${dataset.key}`;
    if (hooks.beforeWrite) await hooks.beforeWrite(graph);
    const db = await openDb(factory);
    try {
      const transaction = db.transaction([STORES.legacy, STORES.timetables, STORES.terms, STORES.baseMeetings, STORES.snapshots, STORES.migrations, STORES.importSnapshots, STORES.courses, STORES.courseOverrides, STORES.occurrenceOverrides, STORES.scheduleOverrides, STORES.schema3Migrations, STORES.appState], "readwrite");
      const completed = transactionDone(transaction);
      let timetableId, existing, ownedGraph, writtenModel;
      try {
      const tables = transaction.objectStore(STORES.timetables), terms = transaction.objectStore(STORES.terms);
      existing = targetId ? await requestValue(tables.get(targetId)) : await requestValue(tables.index("routingKey").get(route));
      if (targetId && !newLocalTarget && (!existing || (!missingSchoolId && (existing.routingKey !== route) !== scopedTarget))) throw new Error("IMPORT_TARGET_CHANGED");
      const existingTerm = await requestValue(terms.get(graph.term.termId));
      if (existingTerm && (!existing || existingTerm.timetableId !== existing.timetableId)) throw new Error("TERM_ROUTE_OWNER_CONFLICT");
      timetableId = targetId || existing?.timetableId || `timetable:academic:${root.AnyClassPhaseB.idComponent([route])}`;
      if (!existing && await requestValue(tables.get(timetableId))) throw new Error("TIMETABLE_ID_COLLISION");
      if (existing && existing.activeTermId && existing.activeTermId !== graph.term.termId) throw new Error("ROUTE_TERM_CONFLICT");
      const importedName = String(dataset.timetableName == null ? "" : dataset.timetableName).trim();
      const confirmedSchoolName = hooks.preserveTargetMetadata && existing?.schoolName ? existing.schoolName : dataset.school.name;
      const timetable = existing ? {...existing,...(importedName ? {label:importedName} : {}),...(missingSchoolId ? {routingKey:route} : {}),schoolId:dataset.school.id,schoolName:confirmedSchoolName,activeTermId:graph.term.termId,updatedAt:new Date().toISOString()} : {...graph.timetable,timetableId,routingKey:route,label:importedName || graph.timetable.label,schoolName:dataset.school.name};
      const term = {...graph.term,timetableId};
      // A later import carrying only application defaults must not replace this timetable's saved times.
      if (existingTerm && config.preserveExistingPeriodTimesWhenDefault) {
        term.periodTimes = existingTerm.periodTimes;
        term.timingStatus = existingTerm.timingStatus;
        term.maxPeriod = existingTerm.maxPeriod;
        term.schoolProfileSnapshot = {...term.schoolProfileSnapshot,periodTimes:existingTerm.periodTimes,timingStatus:existingTerm.timingStatus,maxPeriod:existingTerm.maxPeriod};
      }
      ownedGraph = {...graph,timetable,term};
      const previousLegacy=existing&&writeLegacy?await requestValue(transaction.objectStore(STORES.legacy).get(dataset.key)):null;
      if(previousLegacy&&existingTerm&&canonicalLegacy(previousLegacy)===canonicalLegacy(dataset)){
        if (timetable.label !== existing.label || timetable.schoolName !== existing.schoolName) {
          tables.put(timetable);
          if (writeLegacy) transaction.objectStore(STORES.legacy).put(dataset);
        }
        await completed;
        const unchanged=await readGraph(timetableId,factory);
        if(!unchanged)throw Error("NO_CHANGE_READBACK_FAILED");
        return {status:"NO_CHANGE",graph:unchanged,mergeResult:{status:"NO_CHANGE",unchangedCourses:(await readCourseModel(dataset.key,factory)).courses.length,requiresReview:false}};
      }
      const priorRows = await requestValue(transaction.objectStore(STORES.baseMeetings).index("termId").getAll(term.termId));
      if (priorRows.some(item => item.sourceType !== "academic")) throw new Error("TERM_MEETING_OWNER_AMBIGUOUS");
      if (writeLegacy) transaction.objectStore(STORES.legacy).put(dataset);
      tables.put(timetable);
      terms.put(term);
      const meetings = transaction.objectStore(STORES.baseMeetings);
      for (const item of priorRows) meetings.delete(item.baseMeetingId);
      for (const meeting of graph.baseMeetings) meetings.put(meeting);
      transaction.objectStore(STORES.snapshots).put({snapshotId, sourceKey: dataset.key, capturedAt: new Date().toISOString(), dataset});
      transaction.objectStore(STORES.migrations).put({migrationId, status: "VERIFIED", sourceKey: dataset.key, sourceCanonical: canonicalLegacy(dataset), meetingCount: graph.baseMeetings.length, updatedAt: new Date().toISOString()});
      writtenModel=await writeSchema3(transaction, dataset, ownedGraph, hooks);
      const state = await requestValue(transaction.objectStore(STORES.appState).get("activeTimetableId"));
      if (!state) throw new Error("ACTIVE_TIMETABLE_STATE_MISSING");
      if (state.value === null) transaction.objectStore(STORES.appState).put({key:"activeTimetableId",value:timetableId});
      if (hooks.beforeCommit) {
        hooks.beforeCommit({transaction, graph:ownedGraph});
      }
      await completed;
      } catch (error) {
        try { transaction.abort(); } catch (_) {}
        await completed.catch(() => {});
        throw error;
      }
      const readback = await readGraph(timetableId, factory);
      const ordered = value => [...value].sort((a,b) => a.baseMeetingId.localeCompare(b.baseMeetingId));
      if (!readback || readback.term.timetableId !== timetableId || root.AnyClassPhaseB.canonical(ordered(readback.baseMeetings)) !== root.AnyClassPhaseB.canonical(ordered(graph.baseMeetings))) throw new Error("MIGRATION_READBACK_FAILED");
      await verifySchema3(dataset, ownedGraph, factory);
      return {status:existing ? "REPLACED" : "VERIFIED",graph:readback,mergeResult:writtenModel.mergeResult};
    } finally { db.close(); }
  };

  const putLegacyAndMigrate = (dataset, config, factory = indexedDB, hooks = {}) => persistDataset(dataset,config,factory,hooks,true);

  root.AnyClassStorageV2 = Object.freeze({DB_NAME, DB_VERSION, STORES, countLegacyKey, ensureLatest, getLegacyDataset, latestLegacyDataset, migrateDataset, openDb, putLegacyAndMigrate, readCourseModel, readGraph, verifySchema3,planReimport});
  if (typeof module === "object" && module.exports) module.exports = root.AnyClassStorageV2;
})(typeof globalThis !== "undefined" ? globalThis : this);
