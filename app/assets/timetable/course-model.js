(function (root) {
  "use strict";

  const COURSE_MODEL_VERSION = 2;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const text = value => String(value == null ? "" : value).trim();
  const normalizeCourseName = value => text(value).normalize("NFKC").replace(/\s+/gu," ").toLocaleLowerCase("en");
  const logicalId = course => course.logicalCourseId || course.courseId;
  const nameConflicts = courses => {
    const seen=new Map(),conflicts=[];
    for(const course of courses.filter(row=>row.suppressed!==true)){
      const name=normalizeCourseName(course.title),owner=logicalId(course);
      if(!name)continue;
      const prior=seen.get(name)||[];
      for(const other of prior)if(other.owner!==owner)conflicts.push({name,first:other.course,second:course});
      prior.push({owner,course});seen.set(name,prior);
    }
    return conflicts;
  };

  const sourceType = dataset => text(dataset.source || dataset.school?.sourceSystem || "zhengfang-v9");
  const sourceKey = dataset => text(dataset.key) || `school:${text(dataset.school?.id)}:${text(dataset.semester?.academicYear)}:${text(dataset.semester?.term)}`;
  const snapshotIdentity = dataset => ({sourceKey: sourceKey(dataset), fingerprint: dataset.fingerprint || null, importedAt: dataset.importedAt || null});

  const build = (dataset, graph) => {
    if (!dataset || !Array.isArray(dataset.meetings) || !graph || !Array.isArray(graph.baseMeetings)) throw new Error("INVALID_SCHEMA3_SOURCE");
    if (dataset.meetings.length !== graph.baseMeetings.length) throw new Error("SCHEMA3_SOURCE_COUNT_MISMATCH");
    const key = sourceKey(dataset), type = sourceType(dataset);
    const identity = snapshotIdentity(dataset);
    const encode = root.AnyClassPhaseB?.idComponent;
    if (typeof encode !== "function") throw new Error("PHASE_B_ENGINE_REQUIRED");
    const snapshotId = `import:${encode(identity)}`;
    const importedAt = dataset.importedAt || graph.term?.updatedAt || new Date().toISOString();
    const snapshot = {
      snapshotId,
      modelVersion: COURSE_MODEL_VERSION,
      sourceType: type,
      sourceKey: key,
      importedAt,
      semester: clone(dataset.semester),
      school: clone(dataset.school),
      sourcePayload: clone(dataset),
      provenance: {kind: "schema2-migration", legacyKey: dataset.key || null, legacyFingerprint: dataset.fingerprint || null}
    };
    const courses = graph.baseMeetings.map((base, index) => {
      const raw = dataset.meetings[index];
      const start = graph.term.periodTimes[base.time.startPeriod], end = graph.term.periodTimes[base.time.endPeriod];
      if ((!start || !end) && graph.term.timingStatus !== "INCOMPLETE") throw new Error("SCHEMA3_PERIOD_MISSING");
      return {
        courseId: `course:${encode([key, base.baseMeetingId])}`,
        logicalCourseId:raw?.localLogicalCourseId ? String(raw.localLogicalCourseId) : `course:logical:${encode([key,raw?.sourceCourseId ? `source:${raw.sourceCourseId}` : `name:${normalizeCourseName(raw?.courseName)}`])}`,
        modelVersion: COURSE_MODEL_VERSION,
        sourceOrdinal: index,
        sourceType: type,
        sourceKey: key,
        sourceSnapshotId: snapshotId,
        sourceMeetingId: base.baseMeetingId,
        uidIdentitySeed: {courseName:base.courseName,weekday:base.recurrence.weekday,startPeriod:base.time.startPeriod,endPeriod:base.time.endPeriod,locationRaw:raw?.locationRaw || ""},
        title: base.courseName,
        teacher: Object.hasOwn(base, "teacher") ? base.teacher : null,
        school: clone(dataset.school),
        campus: raw && Object.hasOwn(raw, "campus") ? clone(raw.campus) : null,
        location: raw && Object.hasOwn(raw, "locationRaw") ? clone(raw.locationRaw) : null,
        weekday: base.recurrence.weekday,
        weeks: clone(base.recurrence.weeks),
        startPeriod: base.time.startPeriod,
        endPeriod: base.time.endPeriod,
        startTime: start?.start || null,
        endTime: end?.end || null,
        notes: raw && Object.hasOwn(raw, "notes") ? clone(raw.notes) : null,
        color: raw && Object.hasOwn(raw, "color") ? clone(raw.color) : null,
        sourceRaw: clone(raw),
        suppressed: false
      };
    });
    if (new Set(courses.map(item => item.courseId)).size !== courses.length) throw new Error("SCHEMA3_COURSE_ID_COLLISION");
    return {schemaVersion: 3, snapshot, courses};
  };

  const api = Object.freeze({COURSE_MODEL_VERSION, build, clone, snapshotIdentity, sourceKey, sourceType,normalizeCourseName,logicalId,nameConflicts});
  root.AnyClassCourseModel = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
