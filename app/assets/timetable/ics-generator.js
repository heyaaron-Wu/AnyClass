(function (root) {
  "use strict";

  const encoder = new TextEncoder();
  const pad = value => String(value).padStart(2, "0");
  const int = value => Number.isInteger(value) ? value : Number.NaN;

  const utf8Length = value => encoder.encode(value).length;

  const foldLine = line => {
    const parts = [];
    let current = "";
    let limit = 75;
    for (const character of Array.from(String(line))) {
      if (current && utf8Length(current + character) > limit) {
        parts.push(current);
        current = character;
        limit = 74;
      } else {
        current += character;
      }
    }
    parts.push(current);
    return parts.map((part, index) => index ? ` ${part}` : part).join("\r\n");
  };

  const escapeText = value => String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

  const parseDate = value => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("INVALID_SEMESTER_START_DATE");
    const result = {year: Number(match[1]), month: Number(match[2]), day: Number(match[3])};
    const date = new Date(result.year, result.month - 1, result.day);
    if (date.getFullYear() !== result.year || date.getMonth() !== result.month - 1 || date.getDate() !== result.day) {
      throw new Error("INVALID_SEMESTER_START_DATE");
    }
    return result;
  };

  const occurrenceDate = (semesterStartDate, week, weekday) => {
    const start = parseDate(semesterStartDate);
    const date = new Date(start.year, start.month - 1, start.day + ((week - 1) * 7) + weekday - 1);
    return {year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate()};
  };

  const compactDate = date => `${date.year}${pad(date.month)}${pad(date.day)}`;
  const compactLocal = (date, time) => `${compactDate(date)}T${String(time).replace(":", "")}00`;
  const minutes = time => {
    const match = String(time || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) throw new Error("INVALID_PERIOD_TIME");
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const utcStamp = date => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

  const normalizeLocation = (value, profile) => typeof profile?.normalizeLocation === "function" ? profile.normalizeLocation(value) : String(value || "").trim().replace(/\s+/g, " ");
  const normalizeCampusLocation = (value, profile = root.AnyClassSchoolProfiles?.gupt || root.TimetableSchoolConfigs?.gupt) => normalizeLocation(value, profile);

  const canonicalize = value => JSON.stringify(value);
  const digestHex = async value => {
    let provider = root.crypto;
    if ((!provider || !provider.subtle) && typeof require === "function") provider = require("node:crypto").webcrypto;
    if (!provider || !provider.subtle) throw new Error("SHA256_UNAVAILABLE");
    const digest = await provider.subtle.digest("SHA-256", encoder.encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  };

  const validateMeeting = (meeting, config) => {
    if (!meeting || !String(meeting.courseName || "").trim()) throw new Error("INVALID_COURSE_NAME");
    const weekday = int(meeting.weekday), startPeriod = int(meeting.startPeriod), endPeriod = int(meeting.endPeriod);
    if (weekday < 1 || weekday > 7) throw new Error("INVALID_WEEKDAY");
    if (startPeriod < 1 || endPeriod < startPeriod || !config.periodTimes[startPeriod] || !config.periodTimes[endPeriod]) throw new Error("INVALID_PERIOD");
    if (minutes(config.periodTimes[endPeriod].end) <= minutes(config.periodTimes[startPeriod].start)) throw new Error("INVALID_PERIOD_RANGE");
    if (!Array.isArray(meeting.weeks) || !meeting.weeks.length) throw new Error("INVALID_WEEKS");
    if (meeting.weeks.some(week => !Number.isInteger(week) || week < 1) || new Set(meeting.weeks).size !== meeting.weeks.length) throw new Error("INVALID_WEEKS");
  };

  const expectedEventCount = dataset => {
    if (!dataset || !Array.isArray(dataset.meetings)) throw new Error("INVALID_DATASET");
    return dataset.meetings.reduce((sum, meeting) => {
      if (!Array.isArray(meeting.weeks)) throw new Error("INVALID_WEEKS");
      return sum + meeting.weeks.length;
    }, 0);
  };

  const eventLines = async ({dataset, meeting, week, config, dtstamp, duplicateOrdinal}) => {
    validateMeeting(meeting, config);
    const date = occurrenceDate(config.semesterStartDate, week, meeting.weekday);
    const start = config.periodTimes[meeting.startPeriod].start;
    const end = config.periodTimes[meeting.endPeriod].end;
    const location = normalizeLocation(meeting.locationRaw, config);
    const teacher = String(meeting.teacher || "").trim();
    const summary = `${String(meeting.courseName).trim()}${meeting.isAdjusted ? "（调）" : ""}`;
    const school = dataset.school && (dataset.school.id || dataset.school.name) || "unknown-school";
    const semester = dataset.semester || {};
    const canonicalKey = canonicalize({
      school,
      semester: {academicYear: semester.academicYear || "", term: semester.term || ""},
      courseName: String(meeting.courseName).trim(),
      weekday: meeting.weekday,
      week,
      startPeriod: meeting.startPeriod,
      endPeriod: meeting.endPeriod,
      locationRaw: String(meeting.locationRaw || "").trim(),
      duplicateOrdinal
    });
    const uid = `${await digestHex(canonicalKey)}@course.heyaaron.asia`;
    const description = [`第${meeting.startPeriod}节-第${meeting.endPeriod}节`];
    if (location) description.push(`地点：${location}`);
    if (teacher) description.push(`老师：${teacher}`);
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Shanghai:${compactLocal(date, start)}`,
      `DTEND;TZID=Asia/Shanghai:${compactLocal(date, end)}`,
      `SUMMARY:${escapeText(summary)}`,
      ...(location ? [`LOCATION:${escapeText(location)}`] : []),
      `DESCRIPTION:${escapeText(description.join("\n"))}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText("课程即将开始")}`,
      "END:VALARM",
      "END:VEVENT"
    ];
  };

  const generate = async (dataset, config, options = {}) => {
    if (!config || !config.periodTimes) throw new Error("INVALID_CONFIG");
    parseDate(config.semesterStartDate);
    const expectedEvents = expectedEventCount(dataset);
    if (!expectedEvents) throw new Error("NO_EVENTS");
    const now = options.now instanceof Date ? options.now : new Date();
    const dtstamp = utcStamp(now);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AnyClass//Timetable//ZH-CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Shanghai",
      "X-LIC-LOCATION:Asia/Shanghai",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0800",
      "TZOFFSETTO:+0800",
      "TZNAME:CST",
      "DTSTART:19700101T000000",
      "END:STANDARD",
      "END:VTIMEZONE"
    ];
    const duplicateCounts = new Map();
    for (const meeting of dataset.meetings) {
      validateMeeting(meeting, config);
      for (const week of meeting.weeks) {
        const base = canonicalize([meeting.courseName, meeting.weekday, week, meeting.startPeriod, meeting.endPeriod, meeting.locationRaw || ""]);
        const duplicateOrdinal = duplicateCounts.get(base) || 0;
        duplicateCounts.set(base, duplicateOrdinal + 1);
        lines.push(...await eventLines({dataset, meeting, week, config, dtstamp, duplicateOrdinal}));
      }
    }
    lines.push("END:VCALENDAR");
    const ics = lines.map(foldLine).join("\r\n") + "\r\n";
    const validation = validate(ics, {expectedEvents});
    if (!validation.ok) throw new Error(`ICS_VALIDATION_FAILED:${validation.errors.join(",")}`);
    return {ics, expectedEvents, generatedEvents: validation.eventCount, validation};
  };

  const generateFromFinal = async (graph, config, options = {}) => {
    const engine = root.AnyClassPhaseB || (typeof require === "function" ? require("./phaseb-engine.js") : null);
    if (!engine || !graph || graph.schemaVersion !== 2) throw new Error("INVALID_PHASE_B_GRAPH");
    const finals = engine.finalOccurrences(graph);
    const byKey = new Map(finals.map(item => [`${item.baseMeetingId}|${item.effectiveDate}`, item]));
    const dataset = {
      school: {id: graph.term.schoolProfileSnapshot.schoolId, name: graph.term.schoolProfileSnapshot.schoolName},
      semester: {academicYear: graph.term.academicYear, term: graph.term.termCode},
      meetings: []
    };
    for (const base of graph.baseMeetings) {
      for (const week of base.recurrence.weeks) {
        const date = engine.addDays(graph.term.semesterStartDate, (week - 1) * 7 + base.recurrence.weekday - 1);
        const final = byKey.get(`${base.baseMeetingId}|${date}`);
        if (!final) throw new Error("FINAL_OCCURRENCE_MISSING");
        dataset.meetings.push({
          courseName: final.courseName,
          weekday: base.recurrence.weekday,
          startPeriod: base.time.startPeriod,
          endPeriod: base.time.endPeriod,
          weeks: [week],
          teacher: final.teacher || null,
          locationRaw: final.location || null,
          isAdjusted: final.adjusted === true,
          __baseMeetingId: base.baseMeetingId
        });
      }
    }
    // Rebuild the original meeting grouping so legacy duplicate ordinal and UID semantics stay frozen.
    const grouped = [];
    for (const base of graph.baseMeetings) {
      const rows = dataset.meetings.filter(item => item.__baseMeetingId === base.baseMeetingId);
      if (!rows.length) continue;
      grouped.push({...rows[0], weeks: rows.map(item => item.weeks[0])});
    }
    dataset.meetings = grouped.map(({__baseMeetingId, ...meeting}) => meeting);
    const result = await generate(dataset, config, options);
    return {...result, finalOccurrenceCount: finals.length, engineVersion: engine.ENGINE_VERSION};
  };

  const unfold = ics => String(ics).replace(/\r\n[ \t]/g, "");
  const validate = (ics, options = {}) => {
    const errors = [];
    const raw = String(ics || "");
    const text = unfold(raw);
    const eventBlocks = text.match(/BEGIN:VEVENT\r\n[\s\S]*?\r\nEND:VEVENT/g) || [];
    if (!text.startsWith("BEGIN:VCALENDAR\r\n") || !text.endsWith("END:VCALENDAR\r\n")) errors.push("VCALENDAR_BOUNDARY");
    if (!text.includes("BEGIN:VTIMEZONE\r\n") || !text.includes("TZID:Asia/Shanghai\r\n")) errors.push("TIMEZONE");
    if (options.expectedEvents != null && eventBlocks.length !== options.expectedEvents) errors.push("EVENT_COUNT");
    const uidSet = new Set();
    for (const block of eventBlocks) {
      const field = name => (block.match(new RegExp(`(?:^|\\r\\n)${name}(?:;[^:]*)?:(.*?)(?:\\r\\n|$)`)) || [])[1];
      const uid = field("UID"), start = field("DTSTART"), end = field("DTEND"), summary = field("SUMMARY");
      if (!uid) errors.push("UID");
      else if (uidSet.has(uid)) errors.push("DUPLICATE_UID");
      else uidSet.add(uid);
      if (!start || !/^[0-9]{8}T[0-9]{6}$/.test(start)) errors.push("DTSTART");
      if (!end || !/^[0-9]{8}T[0-9]{6}$/.test(end)) errors.push("DTEND");
      if (start && end && end <= start) errors.push("DTEND_ORDER");
      if (!summary) errors.push("SUMMARY");
      if (!block.includes("DTSTART;TZID=Asia/Shanghai:")) errors.push("TZID");
      if (!block.includes("BEGIN:VALARM\r\nTRIGGER:-PT30M\r\nACTION:DISPLAY\r\nDESCRIPTION:课程即将开始\r\nEND:VALARM")) errors.push("VALARM");
    }
    for (const line of raw.split("\r\n")) if (utf8Length(line) > 75) errors.push("LINE_LENGTH");
    return {ok: errors.length === 0, errors: Array.from(new Set(errors)), eventCount: eventBlocks.length};
  };

  const fileName = dataset => {
    const year = String(dataset && dataset.semester && dataset.semester.academicYear || "课表").replace(/[^0-9A-Za-z\u4e00-\u9fff-]/g, "_");
    const term = String(dataset && dataset.semester && dataset.semester.term || "").replace(/[^0-9A-Za-z\u4e00-\u9fff-]/g, "_");
    return `课程表_${year}${term ? `_第${term}学期` : ""}.ics`;
  };

  const api = {escapeText, expectedEventCount, fileName, foldLine, generate, generateFromFinal, normalizeCampusLocation, normalizeLocation, occurrenceDate, unfold, utf8Length, validate};
  root.TimetableIcs = Object.freeze(api);
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
