(function (root) {
  "use strict";

  const MAX_MEETINGS = 2000;
  const MAX_TEXT_LENGTH = 300;

  class TimetableFileError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "TimetableFileError";
      this.code = code;
    }
  }

  const fail = (code, message) => {
    throw new TimetableFileError(code, message);
  };

  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

  const requiredText = (value, label) => {
    if (typeof value !== "string" || !value.trim()) fail("INVALID_FIELD", `${label}不能为空`);
    const text = value.trim();
    if (text.length > MAX_TEXT_LENGTH) fail("INVALID_FIELD", `${label}过长`);
    return text;
  };

  const optionalText = (value, label) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") fail("INVALID_FIELD", `${label}必须是文本`);
    const text = value.trim();
    if (text.length > MAX_TEXT_LENGTH) fail("INVALID_FIELD", `${label}过长`);
    return text || null;
  };

  const integerInRange = (value, label, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      fail("INVALID_FIELD", `${label}必须是 ${min}-${max} 的整数`);
    }
    return value;
  };

  const normalizeWeeks = (value, index) => {
    if (!Array.isArray(value) || !value.length) fail("INVALID_MEETING", `第 ${index + 1} 条课程缺少周次`);
    const weeks = value.map((week, weekIndex) => integerInRange(week, `第 ${index + 1} 条课程的第 ${weekIndex + 1} 个周次`, 1, 60));
    return [...new Set(weeks)].sort((a, b) => a - b);
  };

  const normalizeMeeting = (meeting, index) => {
    if (!isObject(meeting)) fail("INVALID_MEETING", `第 ${index + 1} 条课程格式错误`);
    const startPeriod = integerInRange(meeting.startPeriod, `第 ${index + 1} 条课程的开始节次`, 1, 30);
    const endPeriod = integerInRange(meeting.endPeriod, `第 ${index + 1} 条课程的结束节次`, 1, 30);
    if (endPeriod < startPeriod) fail("INVALID_MEETING", `第 ${index + 1} 条课程的结束节次早于开始节次`);
    if (meeting.isAdjusted !== undefined && typeof meeting.isAdjusted !== "boolean") {
      fail("INVALID_MEETING", `第 ${index + 1} 条课程的调课标记格式错误`);
    }
    return {
      courseName: requiredText(meeting.courseName, `第 ${index + 1} 条课程名称`),
      weekday: integerInRange(meeting.weekday, `第 ${index + 1} 条课程的星期`, 1, 7),
      startPeriod,
      endPeriod,
      weeks: normalizeWeeks(meeting.weeks, index),
      teacher: optionalText(meeting.teacher, `第 ${index + 1} 条课程的教师`),
      locationRaw: optionalText(meeting.locationRaw, `第 ${index + 1} 条课程的地点`),
      isAdjusted: meeting.isAdjusted === true
    };
  };

  const validateAcademicYear = value => {
    const text = requiredText(value, "学年");
    const match = text.match(/^(\d{4})-(\d{4})$/);
    if (!match || Number(match[2]) !== Number(match[1]) + 1) fail("INVALID_SEMESTER", "学年格式应为 YYYY-YYYY");
    return text;
  };

  const validateAndNormalize = input => {
    if (!isObject(input)) fail("INVALID_ROOT", "文件根节点必须是对象");
    if (input.schemaVersion !== 1) fail("UNSUPPORTED_SCHEMA", "仅支持 schemaVersion 1");
    if (!isObject(input.school)) fail("INVALID_SCHOOL", "缺少学校信息");
    const profile = root.AnyClassSchoolProfileRegistry?.get(input.school.id);
    const adapter = profile && root.AnyClassAdapterRegistry?.get(profile.adapterId);
    if (!profile || !adapter || input.school.name !== profile.name) fail("INVALID_SCHOOL", "该文件不属于受支持的学校");
    let normalized;
    try { normalized = adapter.normalizeCompatibilityDataset(input, profile); }
    catch (_) { fail("INVALID_SCHOOL", "该文件不属于受支持的学校"); }
    if (!isObject(input.semester)) fail("INVALID_SEMESTER", "缺少学期信息");
    const academicYear = validateAcademicYear(normalized.semester.academicYear);
    const term = String(normalized.semester.termCode ?? "").trim();
    if (!/^[12]$/.test(term)) fail("INVALID_SEMESTER", "学期必须是 1 或 2");
    if (!Array.isArray(input.meetings)) fail("INVALID_MEETINGS", "meetings 必须是数组");
    if (!input.meetings.length) fail("EMPTY_MEETINGS", "课程安排不能为空");
    if (input.meetings.length > MAX_MEETINGS) fail("TOO_MANY_MEETINGS", "课程安排数量超出限制");
    const semester = {academicYear, term};
    return {
      schemaVersion: 1,
      key: `${profile.id}::${academicYear}::${term}`,
      school: {id: profile.id, name: profile.name, sourceSystem: "file"},
      semester,
      meetings: normalized.meetings.map(normalizeMeeting),
      importedAt: null,
      source: "file"
    };
  };

  const parseText = text => {
    if (typeof text !== "string" || !text.trim()) fail("EMPTY_FILE", "文件为空");
    let value;
    try {
      value = JSON.parse(text);
    } catch (_error) {
      fail("INVALID_JSON", "文件不是有效的 JSON");
    }
    return validateAndNormalize(value);
  };

  const canonicalMeetings = meetings => meetings
    .map(meeting => ({
      courseName: meeting.courseName,
      weekday: meeting.weekday,
      startPeriod: meeting.startPeriod,
      endPeriod: meeting.endPeriod,
      weeks: [...meeting.weeks],
      teacher: meeting.teacher,
      locationRaw: meeting.locationRaw,
      isAdjusted: meeting.isAdjusted
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  const fingerprint = async dataset => {
    const canonical = JSON.stringify({semester: dataset.semester, meetings: canonicalMeetings(dataset.meetings)});
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  };

  const api = Object.freeze({TimetableFileError, parseText, validateAndNormalize, fingerprint});
  root.AnyClassTimetableFile = api;
  root.HeyAaronTimetableFile = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
