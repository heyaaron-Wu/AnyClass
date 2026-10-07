(function (root) {
  "use strict";

  const requiredText = (value, field) => {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(`NORMALIZED_IMPORT_${field.toUpperCase()}_REQUIRED`);
    return text;
  };

  const create = ({profile, adapter, school, semester, meetings, source, diagnostics = null}) => {
    const fileSchool = source === "file" && !profile && !adapter && school;
    const explicitSchool = school && typeof school === "object";
    const genericBookmark = source === "zhengfang-v9" && profile?.id === "public-zhengfang-v9";
    if (!fileSchool && (!profile || !adapter || profile.adapterId !== adapter.id)) throw new TypeError("NORMALIZED_IMPORT_SOURCE_INVALID");
    if (!semester || !Array.isArray(meetings)) throw new TypeError("NORMALIZED_IMPORT_PAYLOAD_INVALID");
    const schoolId = genericBookmark ? null : explicitSchool ? (String(school.id == null ? "" : school.id).trim() || null) : requiredText(profile.id, "schoolId");
    const schoolName = genericBookmark ? null : explicitSchool ? (String(school.name == null ? "" : school.name).trim() || null) : requiredText(profile.name, "schoolName");
    const academicYear = requiredText(semester.academicYear, "academicYear");
    const term = requiredText(semester.term ?? semester.termCode, "term");
    const normalizedMeetings = meetings.map(meeting => Object.freeze({
      courseName: meeting.courseName,
      weekday: meeting.weekday,
      startPeriod: meeting.startPeriod,
      endPeriod: meeting.endPeriod,
      weeks: Object.freeze([...(meeting.weeks || [])]),
      teacher: meeting.teacher ?? null,
      locationRaw: meeting.locationRaw ?? null,
      ...(meeting.sourceCourseId ? {sourceCourseId: String(meeting.sourceCourseId)} : {}),
      ...(meeting.sourceTeachingClassId || meeting.teachingClassId ? {sourceTeachingClassId: String(meeting.sourceTeachingClassId || meeting.teachingClassId)} : {}),
      isAdjusted: meeting.isAdjusted === true
    }));
    return {
      schemaVersion: 1,
      // A missing source school ID is not a school identity. Persistence scopes
      // this provisional key to the selected local timetable before writing.
      key: schoolId ? `${schoolId}::${academicYear}::${term}` : null,
      school: {id: schoolId, name: schoolName, sourceSystem: fileSchool ? "file" : adapter.id},
      semester: {academicYear, term, ...(semester.raw ? {raw: String(semester.raw)} : {})},
      meetings: normalizedMeetings,
      importedAt: null,
      source: requiredText(source || adapter.id, "source"),
      ...(diagnostics ? {diagnostics: {...diagnostics}} : {})
    };
  };

  const api = Object.freeze({create});
  root.AnyClassNormalizedImport = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
