(function (root) {
  "use strict";

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const pad = value => String(value).padStart(2, "0");
  const addDays = (isoDate, days) => {
    const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("INVALID_SEMESTER_START_DATE");
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  };
  const indexBy = (rows, key, error) => {
    const map = new Map();
    for (const row of rows || []) {
      if (!row || !row[key] || map.has(row[key])) throw new Error(error);
      map.set(row[key], row);
    }
    return map;
  };
  const validateCourse = course => {
    if (!course || !course.courseId || !course.sourceMeetingId || !course.title || !Number.isInteger(course.sourceOrdinal) || course.sourceOrdinal < 0 || !Number.isInteger(course.weekday) || !Array.isArray(course.weeks) || !course.weeks.length || !Number.isInteger(course.startPeriod) || !Number.isInteger(course.endPeriod)) throw new Error("INVALID_SCHEMA3_COURSE");
  };
  const build = (model, context) => {
    if (!model || model.schemaVersion !== 3 || !Array.isArray(model.courses) || !Array.isArray(model.snapshots)) throw new Error("INVALID_SCHEMA3_MODEL");
    const resolver = root.AnyClassCourseResolver;
    if (!resolver) throw new Error("COURSE_RESOLVER_REQUIRED");
    const courseOverrides = indexBy(model.courseOverrides, "courseId", "DUPLICATE_COURSE_OVERRIDE");
    const occurrenceOverrides = indexBy(model.occurrenceOverrides, "occurrenceId", "DUPLICATE_OCCURRENCE_OVERRIDE");
    const semesterStartDate = context?.semesterStartDate, timezone = context?.timezone || "Asia/Shanghai", periodTimes = context?.periodTimes || {};
    if (!semesterStartDate) throw new Error("SCHEMA3_TERM_CONTEXT_REQUIRED");
    const occurrences = [];
    const generatedOccurrenceIds = new Set();
    for (const source of [...model.courses].filter(item => item.suppressed !== true).sort((a, b) => a.sourceOrdinal - b.sourceOrdinal || a.courseId.localeCompare(b.courseId))) {
      validateCourse(source);
      const courseOverride = courseOverrides.get(source.courseId);
      const course = resolver.resolveCourse(source, courseOverride);
      for (const week of [...new Set(course.weeks.map(Number))].sort((a, b) => a - b)) {
        if (!Number.isInteger(week) || week < 1) throw new Error("INVALID_SCHEMA3_WEEK");
        const nominalDate = addDays(semesterStartDate, (week - 1) * 7 + course.weekday - 1);
        const occurrenceId = `occurrence:${root.AnyClassPhaseB.idComponent([source.sourceMeetingId, nominalDate])}`;
        generatedOccurrenceIds.add(occurrenceId);
        const first = periodTimes[course.startPeriod], last = periodTimes[course.endPeriod];
        const baseline = {
          occurrenceId, finalOccurrenceId: occurrenceId, courseId: source.courseId, sourceMeetingId: source.sourceMeetingId,
          sourceOrdinal: source.sourceOrdinal, week, courseWeeks: clone(course.weeks), nominalDate, effectiveDate: nominalDate, weekday: course.weekday,
          startPeriod: course.startPeriod, endPeriod: course.endPeriod,
          startTime: Object.hasOwn(courseOverride?.fields || {}, "startTime") ? course.startTime : (Object.hasOwn(courseOverride?.fields || {}, "startPeriod") ? first?.start : course.startTime || first?.start),
          endTime: Object.hasOwn(courseOverride?.fields || {}, "endTime") ? course.endTime : (Object.hasOwn(courseOverride?.fields || {}, "endPeriod") ? last?.end : course.endTime || last?.end),
          title: course.title, courseName: course.title, teacher: course.teacher ?? null, school: clone(course.school), campus: clone(course.campus),
          location: clone(course.location), notes: clone(course.notes), color: clone(course.color), adjusted: course.sourceRaw?.isAdjusted === true,
          timezone, cancelled: false,
          sourceIdentity: {courseId: source.courseId, sourceMeetingId: source.sourceMeetingId, sourceSnapshotId: source.sourceSnapshotId},
          uidIdentity: {
            courseName: source.title,
            weekday: source.weekday,
            startPeriod: source.startPeriod,
            endPeriod: source.endPeriod,
            locationRaw: source.location == null ? "" : source.location,
            week
          }
        };
        if (!baseline.startTime || !baseline.endTime) throw new Error("SCHEMA3_PERIOD_TIME_MISSING");
        const override = occurrenceOverrides.get(occurrenceId);
        const effective = resolver.resolveOccurrence({course, occurrence: baseline, occurrenceOverride: override});
        if (override?.fields && (Object.hasOwn(override.fields, "startPeriod") || Object.hasOwn(override.fields, "endPeriod"))) {
          const effectiveFirst = periodTimes[effective.startPeriod], effectiveLast = periodTimes[effective.endPeriod];
          if (!Object.hasOwn(override.fields, "startTime")) effective.startTime = effectiveFirst?.start;
          if (!Object.hasOwn(override.fields, "endTime")) effective.endTime = effectiveLast?.end;
        }
        if (!effective.cancelled) occurrences.push(effective);
      }
    }
    for (const override of occurrenceOverrides.values()) if (!generatedOccurrenceIds.has(override.occurrenceId)) throw new Error("ORPHANED_OCCURRENCE_OVERRIDE");
    return occurrences.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.startTime.localeCompare(b.startTime) || a.sourceOrdinal - b.sourceOrdinal || a.occurrenceId.localeCompare(b.occurrenceId));
  };

  const api = Object.freeze({addDays, build});
  root.AnyClassEffectiveOccurrences = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
