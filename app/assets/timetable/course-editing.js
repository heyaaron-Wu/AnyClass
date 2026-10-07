(function (root) {
  "use strict";
  const editable = Object.freeze(["title","teacher","location","weekday","weeks","startPeriod","endPeriod","notes"]);
  const text = value => String(value == null ? "" : value).trim();
  const weeks = value => {
    if (!Array.isArray(value) || !value.length || value.some(week => !Number.isInteger(week) || week < 1) || new Set(value).size !== value.length) throw new Error("COURSE_WEEKS_INVALID");
    return [...value].sort((a,b) => a-b);
  };
  const normalized = (draft, term) => {
    if (!draft || !term) throw new Error("COURSE_EDIT_CONTEXT_MISSING");
    const result = {title:text(draft.title),teacher:text(draft.teacher),location:text(draft.location),notes:text(draft.notes),weekday:Number(draft.weekday),weeks:weeks(draft.weeks),startPeriod:Number(draft.startPeriod),endPeriod:Number(draft.endPeriod)};
    if (!result.title) throw new Error("COURSE_TITLE_REQUIRED");
    if (!Number.isInteger(result.weekday) || result.weekday < 1 || result.weekday > 7) throw new Error("COURSE_WEEKDAY_INVALID");
    if (!Number.isInteger(term.totalWeeks) || term.totalWeeks < 1 || result.weeks.some(week => week > term.totalWeeks)) throw new Error("COURSE_WEEKS_OUT_OF_RANGE");
    if (!Number.isInteger(result.startPeriod) || !Number.isInteger(result.endPeriod) || result.startPeriod < 1 || result.endPeriod < result.startPeriod || !term.periodTimes?.[result.startPeriod] || !term.periodTimes?.[result.endPeriod]) throw new Error("COURSE_PERIOD_INVALID");
    const first = term.periodTimes[result.startPeriod].start, last = term.periodTimes[result.endPeriod].end;
    if (!/^\d{2}:\d{2}$/.test(first) || !/^\d{2}:\d{2}$/.test(last) || first >= last) throw new Error("COURSE_PERIOD_TIME_INVALID");
    return result;
  };
  const sourceValue = (course, field) => field === "weeks" ? [...course.weeks].sort((a,b) => a-b) : ["title","teacher","location","notes"].includes(field) ? text(course[field]) : course[field];
  const differences = (course, draft, term) => {
    if (!course?.courseId) throw new Error("COURSE_SOURCE_MISSING");
    const values = normalized(draft,term), fields = {};
    for (const field of editable) if (JSON.stringify(values[field]) !== JSON.stringify(sourceValue(course,field))) fields[field] = values[field];
    return fields;
  };
  const resolved = (course, override) => ({...course,...(override?.fields || {})});
  const api = Object.freeze({editable,normalized,differences,resolved,sourceValue});
  root.AnyClassCourseEditing = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
