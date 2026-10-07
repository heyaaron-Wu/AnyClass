(function (root) {
  "use strict";
  const storage = () => root.AnyClassStorageV2;
  const S = () => storage().STORES;
  const request = value => new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error || new Error("TIMETABLE_REQUEST_FAILED"));
  });
  const done = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("TIMETABLE_TRANSACTION_FAILED"));
    transaction.onabort = () => reject(transaction.error || new Error("TIMETABLE_TRANSACTION_ABORTED"));
  });
  const using = async (names, mode, operation, factory) => {
    const db = await storage().openDb(factory);
    try {
      const transaction = db.transaction(names, mode), completion = done(transaction);
      try {
        const value = await operation(transaction);
        await completion;
        return value;
      } catch (error) {
        if (mode === "readwrite") try { transaction.abort(); } catch (_) {}
        await completion.catch(() => {});
        throw error;
      }
    } finally { db.close(); }
  };
  const compare = (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.timetableId.localeCompare(b.timetableId);
  const label = value => {
    const result = String(value == null ? "" : value).trim();
    if (!result || result.length > 100) throw new Error("TIMETABLE_LABEL_INVALID");
    return result;
  };
  const activeRow = async transaction => {
    const state = await request(transaction.objectStore(S().appState).get("activeTimetableId"));
    if (!state) throw new Error("ACTIVE_TIMETABLE_STATE_MISSING");
    if (state.value === null) return null;
    const table = await request(transaction.objectStore(S().timetables).get(state.value));
    if (!table) throw new Error("ACTIVE_TIMETABLE_MISSING");
    return table;
  };
  const listTimetables = (factory = indexedDB) => using([S().timetables], "readonly", async tx => (await request(tx.objectStore(S().timetables).getAll())).sort(compare), factory);
  const getTimetable = (id, factory = indexedDB) => using([S().timetables], "readonly", tx => request(tx.objectStore(S().timetables).get(id)), factory);
  const getActiveTimetable = (factory = indexedDB) => using([S().appState,S().timetables], "readonly", activeRow, factory);
  const findTimetableByRoutingKey = (key, factory = indexedDB) => using([S().timetables], "readonly", tx => request(tx.objectStore(S().timetables).index("routingKey").get(key)), factory);
  const setActiveTimetable = (id, factory = indexedDB) => using([S().appState,S().timetables], "readwrite", async tx => {
    const table = await request(tx.objectStore(S().timetables).get(id));
    if (!table) throw new Error("TIMETABLE_NOT_FOUND");
    tx.objectStore(S().appState).put({key:"activeTimetableId",value:id});
    return table;
  }, factory);
  const createTimetable = (input, factory = indexedDB) => using([S().appState,S().timetables], "readwrite", async tx => {
    const name = label(input?.label);
    const route = input?.routingKey == null ? null : String(input.routingKey).trim();
    if (input?.routingKey != null && !route) throw new Error("ROUTING_KEY_INVALID");
    if (route && await request(tx.objectStore(S().timetables).index("routingKey").get(route))) throw new Error("ROUTING_KEY_EXISTS");
    const id = `timetable:user:${crypto.randomUUID()}`, now = new Date().toISOString();
    const row = {timetableId:id,label:name,createdAt:now,updatedAt:now,activeTermId:null,...(route ? {routingKey:route} : {})};
    tx.objectStore(S().timetables).add(row);
    const active = await activeRow(tx);
    if (!active) tx.objectStore(S().appState).put({key:"activeTimetableId",value:id});
    return row;
  }, factory);
  const renameTimetable = (id, name, factory = indexedDB) => using([S().timetables], "readwrite", async tx => {
    const store = tx.objectStore(S().timetables), existing = await request(store.get(id));
    if (!existing) throw new Error("TIMETABLE_NOT_FOUND");
    const row = {...existing,label:label(name),updatedAt:new Date().toISOString()};
    store.put(row);
    return row;
  }, factory);
  const updateTimetableMetadata = (id, input, factory = indexedDB) => using([S().timetables], "readwrite", async tx => {
    const store = tx.objectStore(S().timetables), existing = await request(store.get(id));
    if (!existing) throw new Error("TIMETABLE_NOT_FOUND");
    const schoolName = String(input?.schoolName == null ? "" : input.schoolName).trim();
    if (!schoolName || schoolName.length > 300) throw new Error("TIMETABLE_SCHOOL_NAME_INVALID");
    const row = {...existing,label:label(input?.label),schoolName,updatedAt:new Date().toISOString()};
    store.put(row);
    return row;
  }, factory);

  const readTimetableBundle = (id, factory = indexedDB) => using([S().timetables,S().terms,S().baseMeetings,S().importSnapshots,S().courses,S().courseOverrides,S().occurrenceOverrides,S().scheduleOverrides], "readonly", async tx => {
    const table = await request(tx.objectStore(S().timetables).get(id));
    if (!table) return null;
    if (!table.activeTermId) {
      const terms = await request(tx.objectStore(S().terms).index("timetableId").getAll(id));
      const snapshots = await request(tx.objectStore(S().importSnapshots).index("timetableId").getAll(id));
      const courses = await request(tx.objectStore(S().courses).index("timetableId").getAll(id));
      if (terms.length || snapshots.length || courses.length) throw new Error("TIMETABLE_ACTIVE_TERM_MISSING");
      return {table,term:null,meetings:[],model:null,dataset:null};
    }
    const term = await request(tx.objectStore(S().terms).get(table.activeTermId));
    if (!term || term.timetableId !== id) throw new Error("TIMETABLE_TERM_OWNER_CONFLICT");
    const meetings = await request(tx.objectStore(S().baseMeetings).index("termId").getAll(term.termId));
    const snapshots = await request(tx.objectStore(S().importSnapshots).index("timetableId").getAll(id));
    const allCourses = await request(tx.objectStore(S().courses).index("timetableId").getAll(id));
    const courses = allCourses.filter(row => row.suppressed !== true);
    const allOverrides = await request(tx.objectStore(S().courseOverrides).getAll());
    const allOccurrenceOverrides = await request(tx.objectStore(S().occurrenceOverrides).getAll());
    const scheduleOverrides = await request(tx.objectStore(S().scheduleOverrides).index("timetableId").getAll(id));
    const meetingIds = new Set(meetings.map(row => row.baseMeetingId));
    const snapshotIds = new Set(snapshots.map(row => row.snapshotId));
    for (const course of courses) if (course.sourceType === "manual" ? course.termId !== term.termId || course.sourceSnapshotId || course.sourceMeetingId : !meetingIds.has(course.sourceMeetingId) || !snapshotIds.has(course.sourceSnapshotId)) throw new Error("TIMETABLE_COURSE_OWNER_CONFLICT");
    const courseIds = new Set(courses.map(row => row.courseId));
    const imported = courses.filter(row => row.sourceType !== "manual");
    const activeSnapshotIds = new Set(imported.map(row => row.sourceSnapshotId));
    if (activeSnapshotIds.size > 1) throw new Error("TIMETABLE_ACTIVE_SOURCE_AMBIGUOUS");
    const snapshot = activeSnapshotIds.size ? snapshots.find(row => activeSnapshotIds.has(row.snapshotId)) : [...snapshots].sort((a,b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")))[0];
    if (imported.length && !snapshot) throw new Error("TIMETABLE_SNAPSHOT_MISSING");
    const model={schemaVersion:3,snapshots,courses,courseOverrides:allOverrides.filter(row => courseIds.has(row.courseId)),occurrenceOverrides:allOccurrenceOverrides.filter(row => courseIds.has(row.courseId)),scheduleOverrides};
    if (scheduleOverrides.some(row=>row.kind==="session-group")) root.AnyClassSessionGrouping.validate(model,term,id);
    return {table,term,meetings,model,dataset:snapshot?.sourcePayload || null};
  }, factory);
  const readActiveBundle = async (factory = indexedDB) => {
    const active = await getActiveTimetable(factory);
    return active ? readTimetableBundle(active.timetableId,factory) : null;
  };

  const saveTermPeriodTimes = (timetableId, periodTimes, factory = indexedDB) => using([S().timetables,S().terms,S().courses], "readwrite", async tx => {
    const table = await request(tx.objectStore(S().timetables).get(timetableId));
    if (!table?.activeTermId) throw Error("TIMETABLE_TERM_MISSING");
    const terms = tx.objectStore(S().terms), term = await request(terms.get(table.activeTermId));
    if (!term || term.timetableId !== timetableId) throw Error("TIMETABLE_TERM_OWNER_CONFLICT");
    if (term.schoolProfileSnapshot?.adapterId !== "file" && term.sourceType !== "manual") throw Error("TIMETABLE_SCHEDULE_NOT_LOCAL");
    const courses = (await request(tx.objectStore(S().courses).index("timetableId").getAll(timetableId))).filter(row=>row.suppressed!==true);
    const highest = Math.max(1,term.maxPeriod||0,...Object.keys(term.periodTimes||{}).map(Number),...courses.map(row=>row.endPeriod),...Object.keys(periodTimes||{}).map(Number));
    if (!periodTimes || typeof periodTimes !== "object" || Array.isArray(periodTimes)) throw Error("SCHEDULE_TIMES_INVALID");
    const cleaned = {}; let priorEnd = -1;
    for (const [key,value] of Object.entries(periodTimes).sort(([a],[b])=>Number(a)-Number(b))) {
      const period=Number(key),match=/^([01]\d|2[0-3]):[0-5]\d$/;
      if (!Number.isInteger(period)||period<1||period>highest||!match.test(value?.start)||!match.test(value?.end)||value.start>=value.end) throw Error("SCHEDULE_TIMES_INVALID");
      const startMinutes=Number(value.start.slice(0,2))*60+Number(value.start.slice(3));
      if (startMinutes<priorEnd) throw Error("SCHEDULE_TIMES_OVERLAP");
      priorEnd=Number(value.end.slice(0,2))*60+Number(value.end.slice(3));
      cleaned[period]={start:value.start,end:value.end};
    }
    const timingStatus=Array.from({length:highest},(_,index)=>cleaned[index+1]).every(Boolean)?"COMPLETE":"INCOMPLETE";
    const snapshot=term.schoolProfileSnapshot ? {...term.schoolProfileSnapshot,periodTimes:cleaned,timingStatus,maxPeriod:highest} : null;
    const updated={...term,periodTimes:cleaned,timingStatus,maxPeriod:highest,...(snapshot ? {schoolProfileSnapshot:snapshot} : {}),updatedAt:new Date().toISOString()};
    terms.put(updated);
    return updated;
  }, factory);

  const saveCourseOverride = (courseId, draft, factory = indexedDB) => using([S().appState,S().timetables,S().terms,S().courses,S().courseOverrides,S().occurrenceOverrides,S().scheduleOverrides], "readwrite", async tx => {
    if (!root.AnyClassCourseEditing || !root.AnyClassEffectiveOccurrences) throw new Error("COURSE_EDIT_DEPENDENCY_MISSING");
    const table = await activeRow(tx);
    if (!table?.activeTermId) throw new Error("ACTIVE_TIMETABLE_EMPTY");
    const term = await request(tx.objectStore(S().terms).get(table.activeTermId));
    const course = await request(tx.objectStore(S().courses).get(courseId));
    if (!term || term.timetableId !== table.timetableId || !course || course.timetableId !== table.timetableId || course.suppressed === true || course.sourceType === "manual") throw new Error("COURSE_OWNER_MISMATCH");
    const store = tx.objectStore(S().courseOverrides);
    const existing = await request(store.get(courseId));
    const edited = root.AnyClassCourseEditing.differences(course,draft,term);
    const fields = {...Object.fromEntries(Object.entries(existing?.fields || {}).filter(([key]) => !root.AnyClassCourseEditing.editable.includes(key))),...edited};
    const owned=await request(tx.objectStore(S().courses).index("timetableId").getAll(table.timetableId));
    const overrides=await request(store.getAll());
    const effective=owned.filter(row=>row.suppressed!==true).map(row=>({...row,...(overrides.find(item=>item.courseId===row.courseId)?.fields||{}),...(row.courseId===courseId?fields:{})}));
    const previousTitle=existing?.fields?.title||course.title;
    if(root.AnyClassCourseModel.normalizeCourseName(fields.title||course.title)!==root.AnyClassCourseModel.normalizeCourseName(previousTitle)&&root.AnyClassCourseModel.nameConflicts(effective).some(item=>item.first.courseId===courseId||item.second.courseId===courseId))throw Error("COURSE_NAME_CONFLICT");
    const override = Object.keys(fields).length ? {courseId,fields,updatedAt:new Date().toISOString()} : null;
    const occurrenceOverrides = (await request(tx.objectStore(S().occurrenceOverrides).getAll())).filter(row => row.courseId === courseId);
    root.AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:[course],courseOverrides:override ? [override] : [],occurrenceOverrides,scheduleOverrides:[]},{semesterStartDate:term.semesterStartDate,timezone:term.timezone,periodTimes:term.periodTimes});
    const groups=await request(tx.objectStore(S().scheduleOverrides).index("timetableId").getAll(table.timetableId));
    if(groups.some(row=>row.kind==="session-group")){
      const courses=(await request(tx.objectStore(S().courses).index("timetableId").getAll(table.timetableId))).filter(row=>row.suppressed!==true);
      const overrides=(await request(store.getAll())).filter(row=>row.courseId!==courseId);
      root.AnyClassSessionGrouping.validate({courses,courseOverrides:override?[...overrides,override]:overrides,scheduleOverrides:groups},term,table.timetableId);
    }
    if (override) store.put(override); else store.delete(courseId);
    return {courseId,fields,removed:!override};
  }, factory);

  const saveOccurrenceOverride = (occurrenceId, courseId, draft, factory = indexedDB) => using([S().appState,S().timetables,S().terms,S().courses,S().courseOverrides,S().occurrenceOverrides,S().scheduleOverrides],"readwrite",async tx=>{
    if(!root.AnyClassOccurrenceEditing||!root.AnyClassEffectiveOccurrences)throw Error("OCCURRENCE_EDIT_DEPENDENCY_MISSING");
    const table=await activeRow(tx),course=await request(tx.objectStore(S().courses).get(courseId));
    if(!table?.activeTermId||!course||course.timetableId!==table.timetableId||course.suppressed===true)throw Error("OCCURRENCE_OWNER_CONFLICT");
    const term=await request(tx.objectStore(S().terms).get(table.activeTermId));
    if(!term||term.timetableId!==table.timetableId||(course.sourceType==="manual"&&course.termId!==term.termId))throw Error("OCCURRENCE_TERM_CONFLICT");
    const groups=await request(tx.objectStore(S().scheduleOverrides).index("timetableId").getAll(table.timetableId));
    if(groups.some(row=>row.kind==="session-group"&&row.memberCourseIds?.includes(courseId)))throw Error("OCCURRENCE_GROUP_REVIEW_REQUIRED");
    const courseOverride=await request(tx.objectStore(S().courseOverrides).get(courseId));
    const context={semesterStartDate:term.semesterStartDate,timezone:term.timezone,periodTimes:term.periodTimes};
    const baseline=root.AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:[course],courseOverrides:courseOverride?[courseOverride]:[],occurrenceOverrides:[],scheduleOverrides:[]},context).find(row=>row.occurrenceId===occurrenceId);
    if(!baseline)throw Error("OCCURRENCE_ID_NOT_IN_COURSE");
    const store=tx.objectStore(S().occurrenceOverrides),existing=await request(store.get(occurrenceId));
    if(existing&&existing.courseId!==courseId)throw Error("OCCURRENCE_OWNER_CONFLICT");
    const fields=draft===null?{}:root.AnyClassOccurrenceEditing.differences(baseline,draft,term);
    const record=Object.keys(fields).length?{occurrenceId,courseId,nominalDate:baseline.nominalDate,fields,updatedAt:new Date().toISOString()}:null;
    root.AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:[course],courseOverrides:courseOverride?[courseOverride]:[],occurrenceOverrides:record?[record]:[],scheduleOverrides:[]},context);
    if(record)store.put(record);else store.delete(occurrenceId);
    return {occurrenceId,courseId,fields,removed:!record};
  },factory);

  const restoreOccurrenceField = (occurrenceId,courseId,field,factory=indexedDB) => using([S().appState,S().timetables,S().terms,S().courses,S().courseOverrides,S().occurrenceOverrides],"readwrite",async tx=>{
    if(!root.AnyClassOccurrenceEditing?.editable.includes(field))throw Error("OCCURRENCE_FIELD_INVALID");
    const table=await activeRow(tx),course=await request(tx.objectStore(S().courses).get(courseId)),store=tx.objectStore(S().occurrenceOverrides),existing=await request(store.get(occurrenceId));
    if(!table||!course||course.timetableId!==table.timetableId||course.suppressed===true||!existing||existing.courseId!==courseId)throw Error("OCCURRENCE_OWNER_CONFLICT");
    const fields={...existing.fields};delete fields[field];
    const term=await request(tx.objectStore(S().terms).get(table.activeTermId)),courseOverride=await request(tx.objectStore(S().courseOverrides).get(courseId));
    if(!term||term.timetableId!==table.timetableId)throw Error("OCCURRENCE_TERM_CONFLICT");
    root.AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:[course],courseOverrides:courseOverride?[courseOverride]:[],occurrenceOverrides:Object.keys(fields).length?[{...existing,fields}]:[],scheduleOverrides:[]},term);
    if(Object.keys(fields).length)store.put({...existing,fields,updatedAt:new Date().toISOString()});else store.delete(occurrenceId);
    return {occurrenceId,courseId,fields,removed:!Object.keys(fields).length};
  },factory);

  const manualContext = input => {
    const date = String(input?.semesterStartDate || "");
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0,10) !== date || parsed.getUTCDay() !== 1) throw new Error("MANUAL_START_MONDAY_REQUIRED");
    const totalWeeks = Number(input.totalWeeks);
    if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 52) throw new Error("MANUAL_WEEKS_INVALID");
    const periodTimes = input.periodTimes;
    if (!periodTimes || typeof periodTimes !== "object" || !Object.keys(periodTimes).length) throw new Error("MANUAL_PERIODS_REQUIRED");
    for (const [period,time] of Object.entries(periodTimes)) if (!Number.isInteger(Number(period)) || Number(period) < 1 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time?.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time?.end) || time.start >= time.end) throw new Error("MANUAL_PERIODS_INVALID");
    const timezone=String(input.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||"").trim();
    try { if(!timezone)throw Error();new Intl.DateTimeFormat("en",{timeZone:timezone}); } catch (_) { throw Error("MANUAL_TIMEZONE_INVALID"); }
    return {semesterStartDate:date,totalWeeks,periodTimes:JSON.parse(JSON.stringify(periodTimes)),timezone};
  };
  const createManualCourse = (timetableId, draft, context = null, factory = indexedDB) => using([S().appState,S().timetables,S().terms,S().courses,S().courseOverrides], "readwrite", async tx => {
    if (!root.AnyClassCourseEditing || !root.AnyClassEffectiveOccurrences) throw new Error("COURSE_EDIT_DEPENDENCY_MISSING");
    const tables = tx.objectStore(S().timetables), table = await request(tables.get(timetableId));
    if (!table) throw new Error("TIMETABLE_NOT_FOUND");
    if ((await activeRow(tx))?.timetableId !== timetableId) throw new Error("MANUAL_COURSE_ACTIVE_OWNER_CONFLICT");
    let term = table.activeTermId ? await request(tx.objectStore(S().terms).get(table.activeTermId)) : null;
    if (table.activeTermId && term?.timetableId !== timetableId) throw new Error("TIMETABLE_TERM_OWNER_CONFLICT");
    if (!term) {
      const schedule = manualContext(context);
      term = {termId:`term:manual:${crypto.randomUUID()}`,timetableId,sourceType:"manual",...schedule};
    }
    const values = root.AnyClassCourseEditing.normalized(draft,term);
    const existing = await request(tx.objectStore(S().courses).index("timetableId").getAll(timetableId));
    const overrides=new Map((await request(tx.objectStore(S().courseOverrides).getAll())).map(row=>[row.courseId,row.fields||{}]));
    const same=existing.filter(row=>row.suppressed!==true&&root.AnyClassCourseModel.normalizeCourseName(overrides.get(row.courseId)?.title||row.title)===root.AnyClassCourseModel.normalizeCourseName(values.title));
    const owners=new Set(same.map(root.AnyClassCourseModel.logicalId));
    if(owners.size>1)throw Error("MANUAL_COURSE_LEGACY_NAME_REVIEW_REQUIRED");
    const attach=same.find(row=>row.courseId===draft.attachToCourseId);
    if(same.length&&!attach)throw Error("MANUAL_COURSE_NAME_CONFLICT");
    if(draft.attachToCourseId&&!attach)throw Error("MANUAL_COURSE_ATTACH_TARGET_CHANGED");
    const courseId = `course:manual:${crypto.randomUUID()}`;
    if (await request(tx.objectStore(S().courses).get(courseId))) throw new Error("MANUAL_COURSE_ID_COLLISION");
    const course = {courseId,logicalCourseId:attach?root.AnyClassCourseModel.logicalId(attach):courseId,timetableId,termId:term.termId,sourceType:"manual",sourceOrdinal:Math.max(0,...existing.map(row=>row.sourceOrdinal))+1,nominalWeekday:values.weekday,...values,startTime:term.periodTimes[values.startPeriod].start,endTime:term.periodTimes[values.endPeriod].end,suppressed:false,createdAt:new Date().toISOString()};
    root.AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:[course],courseOverrides:[],occurrenceOverrides:[],scheduleOverrides:[]},term);
    if (!table.activeTermId) { tx.objectStore(S().terms).add(term); tables.put({...table,activeTermId:term.termId,updatedAt:new Date().toISOString()}); }
    tx.objectStore(S().courses).add(course);
    return course;
  }, factory);
  const updateManualCourse = (courseId, draft, factory = indexedDB) => using([S().appState,S().timetables,S().terms,S().courses,S().courseOverrides,S().occurrenceOverrides,S().scheduleOverrides], "readwrite", async tx => {
    if (!root.AnyClassCourseEditing || !root.AnyClassEffectiveOccurrences) throw new Error("COURSE_EDIT_DEPENDENCY_MISSING");
    const course = await request(tx.objectStore(S().courses).get(courseId));
    if (!course || course.sourceType !== "manual" || course.suppressed === true) throw new Error("MANUAL_COURSE_NOT_FOUND");
    const table = await request(tx.objectStore(S().timetables).get(course.timetableId));
    if ((await activeRow(tx))?.timetableId !== course.timetableId) throw new Error("MANUAL_COURSE_ACTIVE_OWNER_CONFLICT");
    const term = await request(tx.objectStore(S().terms).get(course.termId));
    if (!table || table.activeTermId !== course.termId || !term || term.timetableId !== course.timetableId) throw new Error("MANUAL_COURSE_OWNER_CONFLICT");
    const values = root.AnyClassCourseEditing.normalized(draft,term);
    const rows=await request(tx.objectStore(S().courses).index("timetableId").getAll(course.timetableId));
    const editedTitle=root.AnyClassCourseModel.normalizeCourseName(values.title)!==root.AnyClassCourseModel.normalizeCourseName(course.title);
    const effectiveOverrides=new Map((await request(tx.objectStore(S().courseOverrides).getAll())).map(row=>[row.courseId,row.fields||{}]));
    if(editedTitle&&rows.some(row=>row.courseId!==courseId&&row.suppressed!==true&&root.AnyClassCourseModel.normalizeCourseName(effectiveOverrides.get(row.courseId)?.title||row.title)===root.AnyClassCourseModel.normalizeCourseName(values.title)&&root.AnyClassCourseModel.logicalId(row)!==root.AnyClassCourseModel.logicalId(course)))throw Error("MANUAL_COURSE_NAME_CONFLICT");
    const updated = {...course,...values,startTime:term.periodTimes[values.startPeriod].start,endTime:term.periodTimes[values.endPeriod].end,updatedAt:new Date().toISOString()};
    const overrides = (await request(tx.objectStore(S().occurrenceOverrides).index("courseId").getAll(courseId)));
    root.AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:[updated],courseOverrides:[],occurrenceOverrides:overrides,scheduleOverrides:[]},term);
    if (await request(tx.objectStore(S().courseOverrides).get(courseId))) throw new Error("MANUAL_COURSE_OVERRIDE_CONFLICT");
    const groups=await request(tx.objectStore(S().scheduleOverrides).index("timetableId").getAll(course.timetableId));
    if(groups.some(row=>row.kind==="session-group")){
      const courses=(await request(tx.objectStore(S().courses).index("timetableId").getAll(course.timetableId))).filter(row=>row.suppressed!==true).map(row=>row.courseId===courseId?updated:row);
      const courseOverrides=await request(tx.objectStore(S().courseOverrides).getAll());
      root.AnyClassSessionGrouping.validate({courses,courseOverrides,scheduleOverrides:groups},term,course.timetableId);
    }
    tx.objectStore(S().courses).put(updated);
    return updated;
  }, factory);
  const deleteManualCourse = (courseId, factory = indexedDB) => using([S().appState,S().timetables,S().courses,S().courseOverrides,S().occurrenceOverrides,S().scheduleOverrides], "readwrite", async tx => {
    const course = await request(tx.objectStore(S().courses).get(courseId));
    if (!course || course.sourceType !== "manual") throw new Error("MANUAL_COURSE_NOT_FOUND");
    const table = await request(tx.objectStore(S().timetables).get(course.timetableId));
    if ((await activeRow(tx))?.timetableId !== course.timetableId) throw new Error("MANUAL_COURSE_ACTIVE_OWNER_CONFLICT");
    if (!table || table.activeTermId !== course.termId) throw new Error("MANUAL_COURSE_OWNER_CONFLICT");
    const groups=await request(tx.objectStore(S().scheduleOverrides).index("timetableId").getAll(course.timetableId));
    if(groups.some(row=>row.kind==="session-group"&&row.memberCourseIds?.includes(courseId)))throw Error("SESSION_GROUP_UNGROUP_BEFORE_DELETE");
    const rows = await request(tx.objectStore(S().occurrenceOverrides).index("courseId").getAll(courseId));
    for (const row of rows) tx.objectStore(S().occurrenceOverrides).delete(row.occurrenceId);
    tx.objectStore(S().courseOverrides).delete(courseId);
    tx.objectStore(S().courses).delete(courseId);
    return {courseId,timetableId:course.timetableId,deletedOccurrenceOverrides:rows.length};
  }, factory);

  const createSessionGroup = (memberCourseIds, factory = indexedDB) => using([S().appState,S().timetables,S().terms,S().courses,S().courseOverrides,S().occurrenceOverrides,S().scheduleOverrides],"readwrite",async tx=>{
    const table=await activeRow(tx);
    if(!table?.activeTermId)throw Error("ACTIVE_TIMETABLE_EMPTY");
    const term=await request(tx.objectStore(S().terms).get(table.activeTermId));
    if(!term || term.timetableId!==table.timetableId)throw Error("TIMETABLE_TERM_OWNER_CONFLICT");
    if(!Array.isArray(memberCourseIds)||memberCourseIds.length<2||new Set(memberCourseIds).size!==memberCourseIds.length)throw Error("SESSION_GROUP_MEMBERS_INVALID");
    for(const id of memberCourseIds)if((await request(tx.objectStore(S().occurrenceOverrides).index("courseId").getAll(id))).length)throw Error("SESSION_GROUP_OCCURRENCE_REVIEW_REQUIRED");
    const courses=(await request(tx.objectStore(S().courses).index("timetableId").getAll(table.timetableId))).filter(row=>row.suppressed!==true);
    const courseOverrides=await request(tx.objectStore(S().courseOverrides).getAll());
    const store=tx.objectStore(S().scheduleOverrides),scheduleOverrides=await request(store.index("timetableId").getAll(table.timetableId));
    const first=courses.find(row=>row.courseId===memberCourseIds[0]);
    if(!first)throw Error("SESSION_GROUP_MEMBER_OWNER_CONFLICT");
    const resolved={...first,...(courseOverrides.find(row=>row.courseId===first.courseId)?.fields||{})};
    const groupingId=`session-group:${crypto.randomUUID()}`,now=new Date().toISOString();
    const row={scheduleOverrideId:groupingId,groupingId,kind:"session-group",timetableId:table.timetableId,memberCourseIds:[...memberCourseIds],nominalWeekday:resolved.weekday,createdAt:now,updatedAt:now};
    root.AnyClassSessionGrouping.validate({courses,courseOverrides,scheduleOverrides:[...scheduleOverrides,row]},term,table.timetableId);
    store.add(row);
    return row;
  },factory);
  const removeSessionGroup = (groupingId, factory = indexedDB) => using([S().appState,S().timetables,S().scheduleOverrides],"readwrite",async tx=>{
    const table=await activeRow(tx),store=tx.objectStore(S().scheduleOverrides),row=await request(store.get(groupingId));
    if(!table || !row || row.kind!=="session-group" || row.timetableId!==table.timetableId)throw Error("SESSION_GROUP_OWNER_CONFLICT");
    store.delete(groupingId);return {groupingId,timetableId:table.timetableId};
  },factory);

  const deleteTimetable = (id, factory = indexedDB) => using(Object.values(S()), "readwrite", async tx => {
    const getAll = name => request(tx.objectStore(name).getAll());
    const [tables,terms,meetings,snapshots,courses,courseOverrides,occurrenceOverrides,scheduleOverrides,legacy,v1Snapshots,state] = await Promise.all([
      getAll(S().timetables),getAll(S().terms),getAll(S().baseMeetings),getAll(S().importSnapshots),getAll(S().courses),getAll(S().courseOverrides),getAll(S().occurrenceOverrides),getAll(S().scheduleOverrides),getAll(S().legacy),getAll(S().snapshots),request(tx.objectStore(S().appState).get("activeTimetableId"))
    ]);
    if (!tables.some(row => row.timetableId === id)) throw new Error("TIMETABLE_NOT_FOUND");
    if (!state || (state.value !== null && !tables.some(row => row.timetableId === state.value))) throw new Error("ACTIVE_TIMETABLE_STATE_INVALID");
    const tableIds = new Set(tables.map(row => row.timetableId));
    const termOwner = new Map(terms.map(row => [row.termId,row.timetableId]));
    const meetingOwner = new Map(meetings.map(row => [row.baseMeetingId,termOwner.get(row.termId)]));
    const snapshotOwner = new Map(snapshots.map(row => [row.snapshotId,row.timetableId]));
    const courseOwner = new Map(courses.map(row => [row.courseId,row.timetableId]));
    if (termOwner.size !== terms.length || meetingOwner.size !== meetings.length || snapshotOwner.size !== snapshots.length || courseOwner.size !== courses.length) throw new Error("TIMETABLE_DUPLICATE_OWNER_ID");
    for (const table of tables) if (table.activeTermId ? termOwner.get(table.activeTermId) !== table.timetableId : terms.some(row => row.timetableId === table.timetableId)) throw new Error("ACTIVE_TERM_OWNER_AMBIGUOUS");
    for (const row of terms) if (!tableIds.has(row.timetableId)) throw new Error("TERM_OWNER_AMBIGUOUS");
    for (const row of meetings) if (!meetingOwner.get(row.baseMeetingId)) throw new Error("MEETING_OWNER_AMBIGUOUS");
    for (const row of snapshots) if (!tableIds.has(row.timetableId)) throw new Error("SNAPSHOT_OWNER_AMBIGUOUS");
    for (const row of courses) if (!tableIds.has(row.timetableId) || (row.sourceType === "manual" ? termOwner.get(row.termId) !== row.timetableId || row.sourceSnapshotId || row.sourceMeetingId : snapshotOwner.get(row.sourceSnapshotId) !== row.timetableId || (row.suppressed !== true && meetingOwner.get(row.sourceMeetingId) !== row.timetableId))) throw new Error("COURSE_OWNER_AMBIGUOUS");
    for (const row of [...courseOverrides,...occurrenceOverrides]) if (!courseOwner.has(row.courseId)) throw new Error("OVERRIDE_OWNER_AMBIGUOUS");
    for (const row of scheduleOverrides) if (!tableIds.has(row.timetableId)) throw new Error("SCHEDULE_OVERRIDE_OWNER_AMBIGUOUS");
    for (const row of scheduleOverrides.filter(item=>item.kind==="session-group")) if(!Array.isArray(row.memberCourseIds)||row.memberCourseIds.length<2||new Set(row.memberCourseIds).size!==row.memberCourseIds.length||row.memberCourseIds.some(courseId=>courseOwner.get(courseId)!==row.timetableId))throw Error("SESSION_GROUP_OWNER_AMBIGUOUS");
    const ownedTerms = terms.filter(row => row.timetableId === id), ownedTermIds = new Set(ownedTerms.map(row => row.termId));
    const ownedMeetings = meetings.filter(row => ownedTermIds.has(row.termId));
    const ownedSnapshots = snapshots.filter(row => row.timetableId === id);
    const ownedCourses = courses.filter(row => row.timetableId === id), ownedCourseIds = new Set(ownedCourses.map(row => row.courseId));
    const ownedSources = new Set(ownedSnapshots.map(row => row.sourceKey));
    for (const row of snapshots) if (row.timetableId !== id && ownedSources.has(row.sourceKey)) throw new Error("SOURCE_KEY_CROSS_OWNER");
    for (const row of legacy) if (ownedSources.has(row.key) && !ownedTerms.some(term => term.academicYear === row.semester?.academicYear && term.termCode === String(row.semester?.term) && term.schoolProfileSnapshot?.schoolId === row.school?.id)) throw new Error("LEGACY_OWNER_AMBIGUOUS");
    const erase = (name,rows,key) => { const store = tx.objectStore(name); for (const row of rows) store.delete(row[key]); };
    erase(S().occurrenceOverrides,occurrenceOverrides.filter(row => ownedCourseIds.has(row.courseId)),"occurrenceId");
    erase(S().courseOverrides,courseOverrides.filter(row => ownedCourseIds.has(row.courseId)),"courseId");
    erase(S().courses,ownedCourses,"courseId");
    erase(S().importSnapshots,ownedSnapshots,"snapshotId");
    erase(S().scheduleOverrides,scheduleOverrides.filter(row => row.timetableId === id),"scheduleOverrideId");
    erase(S().baseMeetings,ownedMeetings,"baseMeetingId");
    erase(S().terms,ownedTerms,"termId");
    erase(S().snapshots,v1Snapshots.filter(row => ownedSources.has(row.sourceKey)),"snapshotId");
    erase(S().legacy,legacy.filter(row => ownedSources.has(row.key)),"key");
    tx.objectStore(S().timetables).delete(id);
    if (state.value === id) {
      const next = tables.filter(row => row.timetableId !== id).sort(compare)[0];
      tx.objectStore(S().appState).put({key:"activeTimetableId",value:next?.timetableId || null});
    }
    return {deletedTimetableId:id,deletedCourses:ownedCourses.length,deletedSnapshots:ownedSnapshots.length};
  }, factory);
  const api = Object.freeze({listTimetables,getTimetable,getActiveTimetable,setActiveTimetable,createTimetable,renameTimetable,updateTimetableMetadata,findTimetableByRoutingKey,readTimetableBundle,readActiveBundle,saveTermPeriodTimes,saveCourseOverride,restoreOccurrenceField,saveOccurrenceOverride,createManualCourse,updateManualCourse,deleteManualCourse,createSessionGroup,removeSessionGroup,deleteTimetable});
  root.AnyClassTimetableRepository = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
