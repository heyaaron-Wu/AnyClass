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
      ...(meeting.sourceCourseId == null ? {} : {sourceCourseId:requiredText(meeting.sourceCourseId,`第 ${index + 1} 条课程的来源课程 ID`)}),
      ...(meeting.sourceTeachingClassId == null ? {} : {sourceTeachingClassId:requiredText(meeting.sourceTeachingClassId,`第 ${index + 1} 条课程的来源教学班 ID`)}),
      isAdjusted: meeting.isAdjusted === true
    };
  };

  const validateAcademicYear = value => {
    const text = requiredText(value, "学年");
    const match = text.match(/^(\d{4})-(\d{4})$/);
    if (!match || Number(match[2]) !== Number(match[1]) + 1) fail("INVALID_SEMESTER", "学年格式应为 YYYY-YYYY");
    return text;
  };

  const normalizedIdentityText = value => String(value || "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
  const sameSchedule = (a, b) => a.weekday === b.weekday && a.startPeriod === b.startPeriod && a.endPeriod === b.endPeriod && a.weeks.length === b.weeks.length && a.weeks.every((week, index) => week === b.weeks[index]);
  const exactDuplicate = (a, b) => sameSchedule(a, b) && (a.sourceCourseId || null) === (b.sourceCourseId || null) && (a.sourceTeachingClassId || null) === (b.sourceTeachingClassId || null) && normalizedIdentityText(a.courseName) === normalizedIdentityText(b.courseName) && normalizedIdentityText(a.teacher) === normalizedIdentityText(b.teacher) && normalizedIdentityText(a.locationRaw) === normalizedIdentityText(b.locationRaw) && a.isAdjusted === b.isAdjusted;
  const exactExistingDuplicate = (incoming, existing) => sameSchedule(incoming, existing)
    && normalizedIdentityText(incoming.courseName) === normalizedIdentityText(existing.title || existing.courseName)
    && normalizedIdentityText(incoming.teacher) === normalizedIdentityText(existing.teacher)
    && normalizedIdentityText(incoming.locationRaw) === normalizedIdentityText(existing.location || existing.locationRaw);
  const detectDuplicateMeetings = meetings => {
    const pairs = [];
    for (let left = 0; left < meetings.length; left += 1) for (let right = left + 1; right < meetings.length; right += 1) {
      const a = meetings[left], b = meetings[right];
      if (normalizedIdentityText(a.courseName) !== normalizedIdentityText(b.courseName) || normalizedIdentityText(a.teacher) !== normalizedIdentityText(b.teacher) || a.weekday !== b.weekday || a.startPeriod > b.endPeriod || b.startPeriod > a.endPeriod) continue;
      const weeks = a.weeks.filter(week => b.weeks.includes(week));
      if (weeks.length) pairs.push({left, right, weeks, startPeriod: Math.max(a.startPeriod, b.startPeriod), endPeriod: Math.min(a.endPeriod, b.endPeriod), exact: exactDuplicate(a, b)});
    }
    return pairs;
  };

  const validateAndNormalize = input => {
    if (!isObject(input)) fail("INVALID_ROOT", "文件根节点必须是对象");
    if (input.schemaVersion !== 1) fail("UNSUPPORTED_SCHEMA", "仅支持 schemaVersion 1");
    if (!isObject(input.school)) fail("INVALID_SCHOOL", "缺少学校信息");
    const school = {id: optionalText(input.school.id, "学校 ID"), name: optionalText(input.school.name, "学校名称")};
    if (!isObject(input.semester)) fail("INVALID_SEMESTER", "缺少学期信息");
    const academicYear = validateAcademicYear(input.semester.academicYear);
    const term = String(input.semester.term ?? "").trim();
    if (!/^[12]$/.test(term)) fail("INVALID_SEMESTER", "学期必须是 1 或 2");
    if (!Array.isArray(input.meetings)) fail("INVALID_MEETINGS", "meetings 必须是数组");
    if (!input.meetings.length) fail("EMPTY_MEETINGS", "课程安排不能为空");
    if (input.meetings.length > MAX_MEETINGS) fail("TOO_MANY_MEETINGS", "课程安排数量超出限制");
    const semester = {academicYear, term};
    if (!root.AnyClassNormalizedImport) fail("NORMALIZATION_UNAVAILABLE", "导入规范化组件不可用");
    const validated = input.meetings.map(normalizeMeeting);
    const meetings = [];
    let exactDuplicateCount = 0;
    for (const meeting of validated) {
      if (meetings.some(existing => exactDuplicate(existing, meeting))) exactDuplicateCount += 1;
      else meetings.push(meeting);
    }
    const dataset = root.AnyClassNormalizedImport.create({school, semester, meetings, source: "file", diagnostics: {exactDuplicateCount}});
    dataset.timetableName = optionalText(input.timetableName, "课表名称");
    return dataset;
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
      ...(meeting.sourceCourseId ? {sourceCourseId:meeting.sourceCourseId} : {}),
      ...(meeting.sourceTeachingClassId ? {sourceTeachingClassId:meeting.sourceTeachingClassId} : {}),
      isAdjusted: meeting.isAdjusted
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  // Structural validity does not prove that visually extracted weekdays are correct.
  // Count connected overlap groups without rejecting genuine concurrent courses.
  const detectConflicts = meetings => {
    const parent = meetings.map((_, index) => index);
    const find = index => parent[index] === index ? index : (parent[index] = find(parent[index]));
    const join = (left, right) => { const a = find(left), b = find(right); if (a !== b) parent[b] = a; };
    const occupied = new Map(), involved = new Set();
    meetings.forEach((meeting, index) => {
      for (const week of meeting.weeks) for (let period = meeting.startPeriod; period <= meeting.endPeriod; period += 1) {
        const key = `${week}:${meeting.weekday}:${period}`;
        if (occupied.has(key)) { const other = occupied.get(key); involved.add(index); involved.add(other); join(index, other); }
        else occupied.set(key, index);
      }
    });
    const groups=new Map();
    for(const index of involved){const root=find(index);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(index)}
    return {groupCount:groups.size,meetingCount:involved.size,groups:[...groups.values()].map(indices=>indices.sort((a,b)=>a-b))};
  };

  const classifyExistingMeetings = (meetings, courses = [], overrides = [], replacingSourceKey = null) => {
    const changes = new Map(overrides.map(row => [row.courseId, row.fields || {}]));
    const existing = courses.filter(row => row.suppressed !== true && !(replacingSourceKey && row.sourceKey === replacingSourceKey))
      .map(row => ({...row,...(changes.get(row.courseId) || {})}));
    const exactDuplicates = [], conflicts = [];
    meetings.forEach((incoming, incomingIndex) => {
      for (const course of existing) {
        if (incoming.weekday !== course.weekday || incoming.startPeriod > course.endPeriod || course.startPeriod > incoming.endPeriod || !Array.isArray(course.weeks)) continue;
        const weeks = incoming.weeks.filter(week => course.weeks.includes(week));
        if (!weeks.length) continue;
        const pair={incomingIndex,existingCourseId:course.courseId,existing:course,weeks,startPeriod:Math.max(incoming.startPeriod,course.startPeriod),endPeriod:Math.min(incoming.endPeriod,course.endPeriod)};
        if (exactExistingDuplicate(incoming, course)) exactDuplicates.push({...pair,classification:"EXACT_DUPLICATE"});
        else conflicts.push({...pair,classification:"TIME_CONFLICT"});
      }
    });
    return {exactDuplicates,conflicts};
  };
  const detectExistingConflicts = (...args) => classifyExistingMeetings(...args).conflicts;

  const fingerprint = async dataset => {
    const canonical = JSON.stringify({semester: dataset.semester, meetings: canonicalMeetings(dataset.meetings)});
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  };

  const api = Object.freeze({TimetableFileError, parseText, validateAndNormalize, fingerprint, detectConflicts, detectExistingConflicts, classifyExistingMeetings, detectDuplicateMeetings});
  root.AnyClassTimetableFile = api;
  root.HeyAaronTimetableFile = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
