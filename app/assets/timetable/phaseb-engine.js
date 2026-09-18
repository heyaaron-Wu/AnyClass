(function (root) {
  "use strict";

  const ENGINE_VERSION = "phase-b-1";
  const SCHEMA_VERSION = 2;
  const TIMEZONE = "Asia/Shanghai";
  const encoder = new TextEncoder();

  const canonical = value => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  };

  const idComponent = value => {
    const bytes = encoder.encode(canonical(value));
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    const encoded = typeof btoa === "function" ? btoa(text) : Buffer.from(bytes).toString("base64");
    return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const normalizeText = value => String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  const normalizedWeeks = value => [...new Set((Array.isArray(value) ? value : []).map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
  const pad = value => String(value).padStart(2, "0");

  const addDays = (isoDate, days) => {
    const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("INVALID_DATE");
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  };

  const schoolSnapshot = (dataset, config) => {
    const totalWeeks = Math.max(0, ...dataset.meetings.flatMap(meeting => normalizedWeeks(meeting.weeks)));
    if (typeof config.snapshot === "function") return config.snapshot(totalWeeks);
    return Object.freeze({schoolId: dataset.school.id, schoolName: dataset.school.name, schoolProfileVersion: config.profileVersion || "legacy-unversioned", adapterId: config.adapterId || "legacy", adapterVersion: config.adapterVersion || "legacy", timezone: config.timezone || TIMEZONE, semesterStartDate: config.semesterStartDate, totalWeeks, weekStart: config.weekStart || 1, periodTimes: JSON.parse(JSON.stringify(config.periodTimes)), semesterSourceMapping: JSON.parse(JSON.stringify(config.semesterMapping || {})), campusAliases: JSON.parse(JSON.stringify(config.campusAliases || {})), locationNormalizationVersion: config.locationNormalizationVersion || "none"});
  };

  const structuralIdentity = (meeting, context) => ({
    schoolId: context.schoolId,
    termId: context.termId,
    adapterId: context.adapterId,
    courseName: normalizeText(meeting.courseName),
    weekday: meeting.weekday,
    startPeriod: meeting.startPeriod,
    endPeriod: meeting.endPeriod,
    weeks: normalizedWeeks(meeting.weeks)
  });

  const convertV1Dataset = (dataset, config, now = new Date().toISOString()) => {
    if (!dataset || !dataset.school || !dataset.semester || !Array.isArray(dataset.meetings)) throw new Error("INVALID_V1_DATASET");
    if (!normalizeText(dataset.school.id) || !normalizeText(dataset.school.name) || !normalizeText(dataset.semester.academicYear) || !normalizeText(dataset.semester.term)) throw new Error("INVALID_V1_DATASET");
    if (!config || !config.semesterStartDate || !config.periodTimes) throw new Error("INVALID_SCHOOL_PROFILE");
    const timetableId = `timetable:${dataset.school.id}`;
    const termId = `term:${dataset.school.id}:${dataset.semester.academicYear}:${dataset.semester.term}`;
    const profile = schoolSnapshot(dataset, config);
    const context = {schoolId: dataset.school.id, termId, adapterId: profile.adapterId};
    const duplicateCounts = new Map();
    const baseMeetings = dataset.meetings.map(meeting => {
      const weeks = normalizedWeeks(meeting && meeting.weeks);
      if (!meeting || !normalizeText(meeting.courseName) || !Number.isInteger(meeting.weekday) || meeting.weekday < 1 || meeting.weekday > 7 || !Number.isInteger(meeting.startPeriod) || !Number.isInteger(meeting.endPeriod) || meeting.startPeriod > meeting.endPeriod || !config.periodTimes[meeting.startPeriod] || !config.periodTimes[meeting.endPeriod] || weeks.length === 0 || weeks.some(week => week < 1)) throw new Error("INVALID_V1_MEETING");
      const structure = structuralIdentity(meeting, context);
      const structuralKey = canonical(structure);
      const duplicateOrdinal = duplicateCounts.get(structuralKey) || 0;
      duplicateCounts.set(structuralKey, duplicateOrdinal + 1);
      const trusted = normalizeText(meeting.sourceTeachingClassId || meeting.teachingClassId);
      const identity = trusted
        ? {kind: "trusted", schoolId: context.schoolId, termId, adapterId: context.adapterId, sourceTeachingClassId: trusted}
        : {kind: "derived", structure, duplicateOrdinal};
      return {
        baseMeetingId: `academic:${idComponent(identity)}`,
        termId,
        sourceType: "academic",
        adapterId: context.adapterId,
        adapterVersion: profile.adapterVersion,
        ...(trusted ? {sourceTeachingClassId: trusted} : {}),
        sourceEvidence: {confidence: trusted ? "trusted" : "derived", structuralKey, duplicateOrdinal},
        courseName: normalizeText(meeting.courseName),
        recurrence: {weekday: meeting.weekday, weeks: normalizedWeeks(meeting.weeks)},
        time: {startPeriod: meeting.startPeriod, endPeriod: meeting.endPeriod},
        ...(normalizeText(meeting.teacher) ? {teacher: normalizeText(meeting.teacher)} : {}),
        ...(normalizeText(meeting.locationRaw) ? {location: normalizeText(meeting.locationRaw)} : {}),
        ...(meeting.isAdjusted === true ? {adjusted: true} : {}),
        revision: 1
      };
    });
    if (new Set(baseMeetings.map(item => item.baseMeetingId)).size !== baseMeetings.length) throw new Error("AMBIGUOUS_BASE_MEETING_ID");
    const term = {
      termId,
      timetableId,
      academicYear: dataset.semester.academicYear,
      termCode: String(dataset.semester.term),
      timezone: profile.timezone,
      semesterStartDate: profile.semesterStartDate,
      totalWeeks: profile.totalWeeks,
      periodTimes: profile.periodTimes,
      schoolProfileSnapshot: profile,
      importMetadata: {source: dataset.source || dataset.school.sourceSystem || "legacy-v1", legacyKey: dataset.key, legacyFingerprint: dataset.fingerprint || null},
      createdAt: dataset.importedAt || now,
      updatedAt: now
    };
    const timetable = {timetableId, label: "课程表", schoolId: dataset.school.id, activeTermId: termId, createdAt: dataset.importedAt || now, updatedAt: now, schemaVersion: SCHEMA_VERSION};
    return {schemaVersion: SCHEMA_VERSION, timetable, term, baseMeetings, legacyDataset: dataset};
  };

  const periodTime = (term, meeting) => {
    const first = term.periodTimes[meeting.time.startPeriod];
    const last = term.periodTimes[meeting.time.endPeriod];
    if (!first || !last) throw new Error("INVALID_PERIOD");
    return {startTime: first.start, endTime: last.end};
  };

  const logicalOccurrences = graph => graph.baseMeetings.flatMap(meeting => {
    const times = periodTime(graph.term, meeting);
    return meeting.recurrence.weeks.map(week => {
      const nominalDate = addDays(graph.term.semesterStartDate, (week - 1) * 7 + meeting.recurrence.weekday - 1);
      return {
        logicalOccurrenceId: `occurrence:${idComponent([meeting.baseMeetingId, nominalDate])}`,
        baseMeetingId: meeting.baseMeetingId,
        termId: graph.term.termId,
        nominalDate,
        sourceScheduleDate: nominalDate,
        effectiveDate: nominalDate,
        startTime: times.startTime,
        endTime: times.endTime,
        timezone: graph.term.timezone,
        generatedBy: {type: "base"}
      };
    });
  }).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.startTime.localeCompare(b.startTime) || a.baseMeetingId.localeCompare(b.baseMeetingId));

  const finalOccurrences = graph => {
    const meetings = new Map(graph.baseMeetings.map(item => [item.baseMeetingId, item]));
    return logicalOccurrences(graph).map(logical => {
      const meeting = meetings.get(logical.baseMeetingId);
      return {
        finalOccurrenceId: logical.logicalOccurrenceId,
        logicalOccurrenceId: logical.logicalOccurrenceId,
        baseMeetingId: logical.baseMeetingId,
        effectiveDate: logical.effectiveDate,
        startTime: logical.startTime,
        endTime: logical.endTime,
        timezone: logical.timezone,
        courseName: meeting.courseName,
        ...(meeting.teacher ? {teacher: meeting.teacher} : {}),
        ...(meeting.location ? {location: meeting.location} : {}),
        ...(meeting.notes ? {notes: meeting.notes} : {}),
        adjusted: meeting.adjusted === true,
        recurrence: meeting.recurrence,
        time: meeting.time,
        appliedOverrideIds: [],
        conflictState: "none"
      };
    });
  };

  const rebind = (previous, candidates) => {
    const trusted = previous.sourceTeachingClassId && candidates.filter(item => item.sourceTeachingClassId === previous.sourceTeachingClassId);
    if (trusted && trusted.length === 1) return {status: "BOUND", baseMeetingId: trusted[0].baseMeetingId};
    const sameId = candidates.filter(item => item.baseMeetingId === previous.baseMeetingId);
    if (sameId.length === 1) return {status: "BOUND", baseMeetingId: sameId[0].baseMeetingId};
    const structural = candidates.filter(item => item.sourceEvidence && previous.sourceEvidence && item.sourceEvidence.structuralKey === previous.sourceEvidence.structuralKey);
    if (structural.length === 1) return {status: "REBOUND", baseMeetingId: structural[0].baseMeetingId};
    return {status: "ORPHANED_REVIEW_REQUIRED"};
  };

  const api = Object.freeze({ENGINE_VERSION, SCHEMA_VERSION, TIMEZONE, addDays, canonical, convertV1Dataset, finalOccurrences, idComponent, logicalOccurrences, normalizeText, normalizedWeeks, rebind, schoolSnapshot, structuralIdentity});
  root.AnyClassPhaseB = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
