(function (root) {
  "use strict";

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const fields = override => override && override.fields && typeof override.fields === "object" ? override.fields : {};
  const apply = (base, override) => ({...clone(base), ...clone(fields(override))});
  const resolveCourse = (course, courseOverride) => {
    if (!course || !course.courseId) throw new Error("INVALID_COURSE");
    if (courseOverride && courseOverride.courseId !== course.courseId) throw new Error("COURSE_OVERRIDE_MISMATCH");
    return apply(course, courseOverride);
  };
  const resolveOccurrence = ({course, occurrence, courseOverride = null, occurrenceOverride = null}) => {
    if (!occurrence || !occurrence.occurrenceId) throw new Error("INVALID_OCCURRENCE");
    if (occurrence.courseId !== course.courseId) throw new Error("OCCURRENCE_COURSE_MISMATCH");
    if (occurrenceOverride && occurrenceOverride.occurrenceId !== occurrence.occurrenceId) throw new Error("OCCURRENCE_OVERRIDE_MISMATCH");
    return apply({...resolveCourse(course, courseOverride), ...clone(occurrence)}, occurrenceOverride);
  };
  const api = Object.freeze({resolveCourse, resolveOccurrence});
  root.AnyClassCourseResolver = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
