(function (root) {
  "use strict";

  const core = root.TimetableCore || (typeof require === "function" ? require("../../../gate6/timetable-core.js") : null);
  if (!core) throw new Error("TIMETABLE_CORE_REQUIRED");

  const weekdays = Object.freeze(["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]);

  const resolveNow = nowOverride => {
    const value = nowOverride === undefined ? new Date() : new Date(nowOverride);
    if (Number.isNaN(value.getTime())) throw new Error("INVALID_NOW_OVERRIDE");
    return value;
  };

  const normalizeDisplayLocation = (value, profile) => typeof profile?.normalizeLocation === "function" ? profile.normalizeLocation(value) : String(value || "").trim().replace(/\s+/g, " ");

  const dateLabel = date => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const periodLabel = meeting => meeting.startPeriod === meeting.endPeriod
    ? `第${meeting.startPeriod}节`
    : `第${meeting.startPeriod}–${meeting.endPeriod}节`;

  const presentOccurrence = (item, now, profile) => ({
    ...item,
    status: now >= item.end ? "completed" : now >= item.start ? "current" : "upcoming",
    location: normalizeDisplayLocation(item.meeting.locationRaw, profile),
    periodLabel: periodLabel(item.meeting)
  });

  const createTodayModel = (dataset, config, nowOverride) => {
    const now = resolveNow(nowOverride);
    if (dataset?.__courseModel && !Array.isArray(dataset.__effectiveOccurrences)) throw new Error("SCHEMA3_EFFECTIVE_OCCURRENCES_REQUIRED");
    if (!dataset || (!dataset.__courseModel && (!Array.isArray(dataset.meetings) || !dataset.meetings.length))) {
      return {hasDataset: false, now, heroState: "NO_TIMETABLE", today: [], stats: {total: 0, completed: 0, remaining: 0}};
    }

    const analysis = core.analyze(dataset, now, config);
    const today = analysis.today.map(item => presentOccurrence(item, now, config));
    const completed = today.filter(item => item.status === "completed").length;
    const current = analysis.currentClasses.length
      ? [...analysis.currentClasses].sort((a, b) => a.end - b.end)[0]
      : null;
    let heroState = "NO_CLASS";
    let heroItem = null;
    let countdownMinutes = null;

    if (current) {
      heroState = "IN_CLASS";
      heroItem = presentOccurrence(current, now, config);
      countdownMinutes = core.minutesUntil(current.end, now);
    } else if (analysis.todayRemaining.length) {
      heroState = "NEXT_CLASS";
      heroItem = presentOccurrence(analysis.todayRemaining[0], now, config);
      countdownMinutes = core.minutesUntil(analysis.todayRemaining[0].start, now);
    }

    const futureItem = heroState === "NO_CLASS" && analysis.nextClass
      ? presentOccurrence(analysis.nextClass, now, config)
      : null;
    const noClassTitle = analysis.state === "day-finished" ? "今天的课程已结束" : "今天没有课程";

    return {
      hasDataset: true,
      now,
      date: dateLabel(now),
      weekday: weekdays[core.weekday(now) - 1],
      weekLabel: analysis.currentWeek < 1
        ? "学期未开始"
        : analysis.maximumWeek && analysis.currentWeek > analysis.maximumWeek
          ? "学期已结束"
          : `第${analysis.currentWeek}周`,
      analysisState: analysis.state,
      heroState,
      heroItem,
      futureItem,
      noClassTitle,
      countdownMinutes,
      currentCount: analysis.currentClasses.length,
      today,
      stats: {total: today.length, completed, remaining: today.length - completed}
    };
  };

  const api = Object.freeze({createTodayModel, dateLabel, normalizeDisplayLocation, periodLabel, resolveNow, weekdays});
  root.TimetableTodayView = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
