(function (root) {
  "use strict";

  const DAY_MS = 86400000;
  const meetingCache = new WeakMap();
  const graphOf = dataset => dataset && dataset.__phaseBGraph && dataset.__phaseBGraph.schemaVersion === 2 ? dataset.__phaseBGraph : null;

  const legacyMeetingMap = graph => {
    if (meetingCache.has(graph)) return meetingCache.get(graph);
    const map = new Map(graph.baseMeetings.map(base => [base.baseMeetingId, {
      courseName: base.courseName,
      weekday: base.recurrence.weekday,
      startPeriod: base.time.startPeriod,
      endPeriod: base.time.endPeriod,
      weeks: [...base.recurrence.weeks],
      teacher: base.teacher || null,
      locationRaw: base.location || null,
      isAdjusted: base.adjusted === true,
      baseMeetingId: base.baseMeetingId
    }]));
    meetingCache.set(graph, map);
    return map;
  };

  const phaseBOccurrences = graph => {
    const engine = root.AnyClassPhaseB;
    if (!engine) throw new Error("PHASE_B_ENGINE_REQUIRED");
    const meetings = legacyMeetingMap(graph);
    return engine.finalOccurrences(graph).map(item => {
      const meeting = meetings.get(item.baseMeetingId);
      const week = Math.floor((daySerial(parseDate(item.effectiveDate)) - daySerial(parseDate(graph.term.semesterStartDate))) / 7) + 1;
      return {
        meeting, week, weekday: meeting.weekday,
        date: new Date(`${item.effectiveDate}T00:00:00+08:00`),
        dateKey: item.effectiveDate,
        start: new Date(`${item.effectiveDate}T${item.startTime}:00+08:00`),
        end: new Date(`${item.effectiveDate}T${item.endTime}:00+08:00`),
        startText: item.startTime, endText: item.endTime,
        finalOccurrenceId: item.finalOccurrenceId
      };
    });
  };

  const dateParts = value => ({
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate()
  });

  const parseDate = iso => {
    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("INVALID_SEMESTER_START_DATE");
    return {year: Number(match[1]), month: Number(match[2]), day: Number(match[3])};
  };

  const daySerial = parts => Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
  const localDaySerial = date => daySerial(dateParts(date));
  const pad = value => String(value).padStart(2, "0");
  const formatDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const weekday = date => ((date.getDay() + 6) % 7) + 1;

  const currentWeek = (date, config) =>
    Math.floor((localDaySerial(date) - daySerial(parseDate(config.semesterStartDate))) / 7) + 1;

  const occurrenceDate = (week, meetingWeekday, config) => {
    const start = parseDate(config.semesterStartDate);
    return new Date(start.year, start.month - 1, start.day + ((week - 1) * 7) + meetingWeekday - 1);
  };

  const withTime = (date, value) => {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) throw new Error("INVALID_PERIOD_TIME");
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(match[1]), Number(match[2]), 0, 0);
  };

  const meetingTimes = (meeting, config) => {
    const first = config.periodTimes[meeting.startPeriod];
    const last = config.periodTimes[meeting.endPeriod];
    if (!first || !last) return null;
    return {start: first.start, end: last.end};
  };

  const occurrence = (meeting, week, config) => {
    const times = meetingTimes(meeting, config);
    if (!times) return null;
    const date = occurrenceDate(week, meeting.weekday, config);
    return {
      meeting,
      week,
      weekday: meeting.weekday,
      date,
      dateKey: formatDate(date),
      start: withTime(date, times.start),
      end: withTime(date, times.end),
      startText: times.start,
      endText: times.end
    };
  };

  const maxDatasetWeek = dataset => {
    const graph = graphOf(dataset);
    return graph ? graph.term.totalWeeks : Math.max(0, ...((dataset && dataset.meetings) || []).flatMap(m => Array.isArray(m.weeks) ? m.weeks : []));
  };

  const allOccurrences = (dataset, config) => {
    const graph = graphOf(dataset);
    if (graph) return phaseBOccurrences(graph).sort((a, b) => a.start - b.start || a.end - b.end);
    if (!dataset || !Array.isArray(dataset.meetings)) return [];
    return dataset.meetings.flatMap(meeting =>
      (Array.isArray(meeting.weeks) ? meeting.weeks : [])
        .map(week => occurrence(meeting, week, config))
        .filter(Boolean)
    ).sort((a, b) => a.start - b.start || a.end - b.end);
  };

  const analyze = (dataset, now, config) => {
    if (!dataset || !Array.isArray(dataset.meetings) || !dataset.meetings.length) {
      return {state: "no-timetable", currentWeek: null, currentClasses: [], nextClass: null, today: [], todayRemaining: []};
    }
    const week = currentWeek(now, config);
    const maximumWeek = maxDatasetWeek(dataset);
    const occurrences = allOccurrences(dataset, config);
    const todayKey = formatDate(now);
    const today = occurrences.filter(item => item.dateKey === todayKey);
    const currentClasses = today.filter(item => now >= item.start && now < item.end);
    const todayRemaining = today.filter(item => item.start > now);
    const nextClass = occurrences.find(item => item.start > now) || null;
    let state = "active";
    if (week < 1) state = "before-semester";
    else if (maximumWeek && week > maximumWeek) state = "semester-finished";
    else if (!today.length) state = "no-class-today";
    else if (!currentClasses.length && !todayRemaining.length) state = "day-finished";
    return {state, currentWeek: week, maximumWeek, currentClasses, nextClass, today, todayRemaining, occurrences};
  };

  const meetingsForWeek = (dataset, week, config) => {
    const graph = graphOf(dataset);
    if (graph) return phaseBOccurrences(graph)
      .filter(item => item.week === week)
      .sort((a, b) => a.weekday - b.weekday || a.meeting.startPeriod - b.meeting.startPeriod || a.meeting.endPeriod - b.meeting.endPeriod);
    if (!dataset || !Array.isArray(dataset.meetings)) return [];
    return dataset.meetings
      .filter(meeting => Array.isArray(meeting.weeks) && meeting.weeks.includes(week))
      .map(meeting => occurrence(meeting, week, config))
      .filter(Boolean)
      .sort((a, b) => a.weekday - b.weekday || a.meeting.startPeriod - b.meeting.startPeriod || a.meeting.endPeriod - b.meeting.endPeriod);
  };

  const layoutWeek = occurrences => {
    let scheduleConflictCount = 0;
    const laidOut = [];
    for (let day = 1; day <= 7; day += 1) {
      const items = occurrences.filter(item => item.weekday === day);
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i].meeting, b = items[j].meeting;
          if (a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod) scheduleConflictCount += 1;
        }
      }
      const lanes = [];
      const entries = items.map(item => {
        let lane = lanes.findIndex(end => end < item.meeting.startPeriod);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = item.meeting.endPeriod;
        return {...item, lane};
      });
      const laneCount = Math.max(1, lanes.length);
      laidOut.push(...entries.map(item => ({...item, laneCount})));
    }
    return {items: laidOut, scheduleConflictCount};
  };

  const minutesUntil = (later, now) => Math.max(0, Math.ceil((later - now) / 60000));
  const durationText = minutes => minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ""}`;

  const api = {analyze, allOccurrences, currentWeek, durationText, formatDate, graphOf, layoutWeek, maxDatasetWeek, meetingTimes, meetingsForWeek, minutesUntil, occurrence, occurrenceDate, weekday};
  root.TimetableCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
