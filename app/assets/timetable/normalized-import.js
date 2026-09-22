(function (root) {
  "use strict";

  const requiredText = (value, field) => {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(`NORMALIZED_IMPORT_${field.toUpperCase()}_REQUIRED`);
    return text;
  };

  const create = ({profile, adapter, semester, meetings, source, diagnostics = null}) => {
    if (!profile || !adapter || profile.adapterId !== adapter.id) throw new TypeError("NORMALIZED_IMPORT_SOURCE_INVALID");
    if (!semester || !Array.isArray(meetings)) throw new TypeError("NORMALIZED_IMPORT_PAYLOAD_INVALID");
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
      isAdjusted: meeting.isAdjusted === true
    }));
    return {
      schemaVersion: 1,
      key: `${profile.id}::${academicYear}::${term}`,
      school: {id: profile.id, name: profile.name, sourceSystem: adapter.id},
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
