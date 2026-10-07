(function (root) {
  "use strict";

  const fail = code => { throw new Error(`SCHEMA4_${code}`); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = value => String(value == null ? "" : value).trim();
  const identity = (schoolId, year, term) => JSON.stringify([text(schoolId), text(year), text(term)]);
  const same = (left, right) => root.AnyClassPhaseB.canonical(left) === root.AnyClassPhaseB.canonical(right);
  const academicRoutingKey = (adapterId, schoolId, year, term) => {
    if (![adapterId, schoolId, year, term].every(value => text(value))) fail("ROUTING_IDENTITY_MISSING");
    return `academic:${root.AnyClassPhaseB.idComponent([text(adapterId), text(schoolId), text(year), text(term)])}`;
  };

  const plan = (rows, oldVersion) => {
    if (!root.AnyClassPhaseB || !root.AnyClassCourseModel) fail("DEPENDENCY_MISSING");
    const take = name => Array.isArray(rows[name]) ? rows[name] : [];
    const legacy = take("timetables"), originalTables = take("v2Timetables"), originalTerms = take("terms");
    const originalMeetings = take("baseMeetings"), originalSnapshots = take("importSnapshots");
    const originalCourses = take("courses"), courseOverrides = take("courseOverrides"), occurrenceOverrides = take("occurrenceOverrides"), scheduleOverrides = take("scheduleOverrides");
    if (oldVersion > 3) fail("UNSUPPORTED_OLD_VERSION");
    if (legacy.length && !originalTables.length && !originalTerms.length && !originalMeetings.length) {
      if (originalSnapshots.length || originalCourses.length || take("v1Snapshots").length || take("v2Migrations").length) fail("PARTIAL_LEGACY_GRAPH");
      const graphs = legacy.map(dataset => {
        const profile = root.AnyClassSchoolProfileRegistry?.get(dataset.school?.id);
        if (!profile) fail("LEGACY_PROFILE_UNAVAILABLE");
        return root.AnyClassPhaseB.convertV1Dataset(dataset,profile,dataset.importedAt || new Date().toISOString());
      });
      const tables = new Map();
      for (const graph of graphs) {
        const current = tables.get(graph.timetable.timetableId);
        if (!current || String(graph.term.createdAt).localeCompare(String(current.createdAt)) > 0) tables.set(graph.timetable.timetableId,{...graph.timetable,activeTermId:graph.term.termId});
      }
      const v1Snapshots = legacy.map(dataset => ({snapshotId:`v1:${dataset.key}`,sourceKey:dataset.key,dataset}));
      const v2Migrations = legacy.map(dataset => ({migrationId:`v1-to-v2:${dataset.key}`,sourceKey:dataset.key,status:"VERIFIED",sourceCanonical:root.AnyClassPhaseB.canonical({key:dataset.key,school:dataset.school,semester:dataset.semester,meetings:dataset.meetings,fingerprint:dataset.fingerprint || null}),meetingCount:dataset.meetings.length}));
      const derived = plan({...rows,v2Timetables:[...tables.values()],terms:graphs.map(graph=>graph.term),baseMeetings:graphs.flatMap(graph=>graph.baseMeetings),v1Snapshots,v2Migrations},2);
      return {...derived,baseMeetings:graphs.flatMap(graph=>graph.baseMeetings),v1Snapshots,v2Migrations};
    }
    if (!originalTables.length && !originalTerms.length && !legacy.length && !originalMeetings.length && !originalSnapshots.length && !originalCourses.length) {
      if (courseOverrides.length || occurrenceOverrides.length || scheduleOverrides.length || take("v1Snapshots").length || take("v2Migrations").length || take("schema3Migrations").length) fail("ORPHAN_DATA");
      return {timetables:[],terms:[],courses:[],importSnapshots:[],schema3Migrations:[],activeTimetableId:null};
    }
    const oldTableById = new Map(originalTables.map(row => [row.timetableId, row]));
    const termById = new Map(originalTerms.map(row => [row.termId, row]));
    const meetingById = new Map(originalMeetings.map(row => [row.baseMeetingId, row]));
    if (oldTableById.size !== originalTables.length || termById.size !== originalTerms.length || meetingById.size !== originalMeetings.length) fail("DUPLICATE_ID");
    if (!originalTables.length || !originalTerms.length) fail("MISSING_TABLE_OR_TERM");
    const termByIdentity = new Map();
    for (const term of originalTerms) {
      const table = oldTableById.get(term.timetableId);
      const schoolId = text(term.schoolProfileSnapshot?.schoolId);
      if (!table || !schoolId || table.schoolId !== schoolId || !text(term.academicYear) || !text(term.termCode)) fail("TERM_PARENT_CONFLICT");
      const key = identity(schoolId, term.academicYear, term.termCode);
      if (termByIdentity.has(key)) fail("DUPLICATE_TERM_IDENTITY");
      termByIdentity.set(key, term);
    }
    for (const table of originalTables) if (!termById.has(table.activeTermId) || termById.get(table.activeTermId).timetableId !== table.timetableId) fail("ACTIVE_TERM_CONFLICT");
    for (const meeting of originalMeetings) if (!termById.has(meeting.termId)) fail("BASEMEETING_ORPHAN");

    const targetByTerm = new Map(), timetables = [], terms = [];
    const routingKeys = new Set();
    for (const table of [...originalTables].sort((a,b) => a.timetableId.localeCompare(b.timetableId))) {
      const owned = originalTerms.filter(term => term.timetableId === table.timetableId);
      if (!owned.length) fail("EMPTY_LEGACY_TABLE");
      if (owned.length > 1 && scheduleOverrides.some(row => row.timetableId === table.timetableId)) fail("SCHEDULE_OVERRIDE_MULTI_TERM_AMBIGUOUS");
      for (const term of owned) {
        const targetId = term.termId === table.activeTermId ? table.timetableId : `timetable:historic:${root.AnyClassPhaseB.idComponent(term.termId)}`;
        const route = academicRoutingKey(term.schoolProfileSnapshot.adapterId, table.schoolId, term.academicYear, term.termCode);
        if (routingKeys.has(route) || timetables.some(item => item.timetableId === targetId)) fail("ROUTING_COLLISION");
        routingKeys.add(route);
        targetByTerm.set(term.termId, targetId);
        timetables.push({...clone(table),timetableId:targetId,activeTermId:term.termId,routingKey:route});
        terms.push({...clone(term),timetableId:targetId});
      }
    }

    const datasetsByTerm = new Map();
    for (const dataset of legacy) {
      const key = identity(dataset.school?.id,dataset.semester?.academicYear,dataset.semester?.term);
      const term = termByIdentity.get(key);
      if (!term || datasetsByTerm.has(term.termId) || !text(dataset.key)) fail("LEGACY_DATASET_AMBIGUOUS");
      datasetsByTerm.set(term.termId,dataset);
    }
    for (const term of originalTerms) if (!datasetsByTerm.has(term.termId)) fail("TERM_SOURCE_MISSING");
    let snapshots = originalSnapshots.map(clone), courses = originalCourses.map(clone);
    const schema3Migrations = [];
    if (oldVersion < 3) {
      if (snapshots.length || courses.length) fail("SCHEMA2_HAS_SCHEMA3_ROWS");
      for (const term of originalTerms) {
        const dataset = datasetsByTerm.get(term.termId);
        const profile = term.schoolProfileSnapshot;
        if (!dataset || !profile || !term.periodTimes || !term.semesterStartDate) fail("SCHEMA2_SOURCE_MISSING");
        const config = {semesterStartDate:term.semesterStartDate,periodTimes:term.periodTimes,snapshot:() => clone(profile)};
        const graph = root.AnyClassPhaseB.convertV1Dataset(dataset,config,term.updatedAt || term.createdAt);
        const before = originalMeetings.filter(item => item.termId === term.termId).sort((a,b) => a.baseMeetingId.localeCompare(b.baseMeetingId));
        const after = [...graph.baseMeetings].sort((a,b) => a.baseMeetingId.localeCompare(b.baseMeetingId));
        if (graph.term.termId !== term.termId || !same(before,after)) fail("SCHEMA2_BASEMEETING_MISMATCH");
        const built = root.AnyClassCourseModel.build(dataset,graph);
        snapshots.push(built.snapshot);
        courses.push(...built.courses);
        const sourceCanonical = root.AnyClassPhaseB.canonical({key:dataset.key,school:dataset.school,semester:dataset.semester,meetings:dataset.meetings,fingerprint:dataset.fingerprint || null});
        const migration = take("v2Migrations").find(item => item.migrationId === `v1-to-v2:${dataset.key}`);
        if (!migration || migration.status !== "VERIFIED" || migration.sourceCanonical !== sourceCanonical || migration.meetingCount !== before.length) fail("SCHEMA2_MIGRATION_MISMATCH");
        const v1 = take("v1Snapshots").find(item => item.snapshotId === `v1:${dataset.key}`);
        if (!v1 || v1.sourceKey !== dataset.key || !same(v1.dataset,dataset)) fail("SCHEMA2_SNAPSHOT_MISMATCH");
        schema3Migrations.push({migrationId:`v2-to-v3:${built.snapshot.sourceKey}`,modelVersion:root.AnyClassCourseModel.COURSE_MODEL_VERSION,status:"VERIFIED",sourceKey:built.snapshot.sourceKey,sourceCanonical,snapshotId:built.snapshot.snapshotId,courseCount:built.courses.length,updatedAt:term.updatedAt || term.createdAt});
      }
    }
    const snapshotById = new Map(snapshots.map(item => [item.snapshotId,item]));
    const courseById = new Map(courses.map(item => [item.courseId,item]));
    if (snapshotById.size !== snapshots.length || courseById.size !== courses.length) fail("DUPLICATE_SCHEMA3_ID");
    if (oldVersion === 3) {
      for (const term of originalTerms) {
        const dataset = datasetsByTerm.get(term.termId);
        const graph = root.AnyClassPhaseB.convertV1Dataset(dataset,{semesterStartDate:term.semesterStartDate,periodTimes:term.periodTimes,snapshot:() => clone(term.schoolProfileSnapshot)},term.updatedAt || term.createdAt);
        const built = root.AnyClassCourseModel.build(dataset,graph);
        const actualSnapshot = originalSnapshots.find(row => row.snapshotId === built.snapshot.snapshotId);
        const activeCourses = originalCourses.filter(row => row.sourceSnapshotId === built.snapshot.snapshotId && row.suppressed !== true);
        const ordered = value => [...value].sort((a,b) => a.courseId.localeCompare(b.courseId));
        if (!actualSnapshot || !same(actualSnapshot.sourcePayload,dataset) || !same(ordered(activeCourses),ordered(built.courses))) fail("SCHEMA3_READBACK_MISMATCH");
      }
    }
    const sourceTerm = new Map();
    snapshots = snapshots.map(snapshot => {
      const term = termByIdentity.get(identity(snapshot.school?.id,snapshot.semester?.academicYear,snapshot.semester?.term));
      if (!term || !text(snapshot.sourceKey)) fail("SNAPSHOT_OWNER_AMBIGUOUS");
      const previous = sourceTerm.get(snapshot.sourceKey);
      if (previous && previous !== term.termId) fail("CROSS_TERM_SOURCEKEY_COLLISION");
      sourceTerm.set(snapshot.sourceKey,term.termId);
      return {...snapshot,timetableId:targetByTerm.get(term.termId)};
    });
    const ownerByCourse = new Map();
    courses = courses.map(course => {
      const snapshot = snapshotById.get(course.sourceSnapshotId);
      const meeting = meetingById.get(course.sourceMeetingId);
      if (!snapshot || !meeting) fail("COURSE_PARENT_MISSING");
      const snapshotTerm = termByIdentity.get(identity(snapshot.school?.id,snapshot.semester?.academicYear,snapshot.semester?.term));
      if (!snapshotTerm || snapshotTerm.termId !== meeting.termId || course.sourceKey !== snapshot.sourceKey) fail("COURSE_PARENT_CONFLICT");
      const owner = targetByTerm.get(meeting.termId);
      if (!owner) fail("COURSE_OWNER_MISSING");
      ownerByCourse.set(course.courseId,owner);
      return {...course,timetableId:owner};
    });
    for (const override of [...courseOverrides,...occurrenceOverrides]) if (!ownerByCourse.has(override.courseId)) fail("OVERRIDE_ORPHAN");
    for (const override of scheduleOverrides) if (!override.timetableId || !timetables.some(item => item.timetableId === override.timetableId)) fail("SCHEDULE_OVERRIDE_OWNER_AMBIGUOUS");
    const activeOriginal = [...originalTables].sort((a,b) => a.timetableId.localeCompare(b.timetableId))[0];
    const activeTimetableId = targetByTerm.get(activeOriginal.activeTermId);
    if (!activeTimetableId) fail("ACTIVE_TABLE_MISSING");
    return {timetables,terms,courses,importSnapshots:snapshots,schema3Migrations,activeTimetableId};
  };
  const api = Object.freeze({academicRoutingKey,plan});
  root.AnyClassSchema4Plan = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
