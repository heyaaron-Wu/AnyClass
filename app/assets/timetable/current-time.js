(function (root) {
  "use strict";

  const DEFAULT_METRICS = Object.freeze({rowHeight: 58, inset: 6});

  const timeToMinutes = value => {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) throw new Error("INVALID_TIME");
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) throw new Error("INVALID_TIME");
    return (hours * 60) + minutes;
  };

  const schoolClock = (value, timezone) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(value).reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = Number(part.value);
      return result;
    }, {});
    return Object.freeze({
      year: parts.year, month: parts.month, day: parts.day,
      hour: parts.hour, minute: parts.minute,
      minutes: (parts.hour * 60) + parts.minute,
      localDate: new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)
    });
  };
  const minutesForDate = (value, timezone) => schoolClock(value, timezone).minutes;
  const pad = value => String(value).padStart(2, "0");
  const formatTime = value => `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  const clamp = value => Math.max(0, Math.min(1, value));
  const interpolate = (start, end, progress) => start + ((end - start) * clamp(progress));

  const periodsFrom = periodTimes => Object.keys(periodTimes || {})
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b)
    .map((period, index) => {
      const definition = periodTimes[period];
      const startMinute = timeToMinutes(definition && definition.start);
      const endMinute = timeToMinutes(definition && definition.end);
      if (endMinute <= startMinute) throw new Error("INVALID_PERIOD_RANGE");
      return {period, index, startMinute, endMinute};
    });

  const mapMinutesToPosition = (minute, periodTimes, metrics = DEFAULT_METRICS) => {
    const periods = periodsFrom(periodTimes);
    if (!periods.length) throw new Error("PERIOD_TIMES_REQUIRED");
    const rowHeight = Number(metrics.rowHeight) || DEFAULT_METRICS.rowHeight;
    const inset = Math.max(0, Math.min(rowHeight / 2, Number(metrics.inset) || DEFAULT_METRICS.inset));
    const totalHeight = periods.length * rowHeight;
    const first = periods[0];
    const last = periods[periods.length - 1];

    if (minute < first.startMinute) return {phase: "before", y: 0, progress: 0, period: null};
    if (minute > last.endMinute) return {phase: "after", y: totalHeight, progress: 1, period: null};

    for (const item of periods) {
      if (minute >= item.startMinute && minute <= item.endMinute) {
        const progress = (minute - item.startMinute) / (item.endMinute - item.startMinute);
        return {
          phase: "period",
          period: item.period,
          progress: clamp(progress),
          y: interpolate((item.index * rowHeight) + inset, ((item.index + 1) * rowHeight) - inset, progress)
        };
      }
    }

    for (let index = 0; index < periods.length - 1; index += 1) {
      const previous = periods[index];
      const next = periods[index + 1];
      if (minute > previous.endMinute && minute < next.startMinute) {
        const progress = (minute - previous.endMinute) / (next.startMinute - previous.endMinute);
        return {
          phase: "break",
          period: null,
          afterPeriod: previous.period,
          beforePeriod: next.period,
          progress: clamp(progress),
          y: interpolate(((previous.index + 1) * rowHeight) - inset, (next.index * rowHeight) + inset, progress)
        };
      }
    }

    throw new Error("TIME_MAPPING_FAILED");
  };

  const mapDateToPosition = (date, periodTimes, metrics) =>
    mapMinutesToPosition(minutesForDate(date), periodTimes, metrics);

  const visibleRange = periodTimes => {
    const periods = periodsFrom(periodTimes);
    if (!periods.length) throw new Error("PERIOD_TIMES_REQUIRED");
    return Object.freeze({firstStartMinute: periods[0].startMinute, lastEndMinute: periods.at(-1).endMinute, firstPeriod: periods[0].period, lastPeriod: periods.at(-1).period});
  };

  const isWithinVisibleTimeRange = (minute, periodTimes) => {
    const range = visibleRange(periodTimes);
    return minute >= range.firstStartMinute && minute <= range.lastEndMinute;
  };

  const stateFor = (date, config, selectedWeek, core) => {
    const engine = core || root.TimetableCore;
    if (!engine) throw new Error("TIMETABLE_CORE_REQUIRED");
    const clock = schoolClock(date, config.timezone);
    const currentWeek = engine.currentWeek(clock.localDate, config);
    const weekday = engine.weekday(clock.localDate);
    const minute = clock.minutes;
    const range = visibleRange(config.periodTimes);
    const withinRange = isWithinVisibleTimeRange(minute, config.periodTimes);
    const state = {
      date,
      timeText: `${pad(clock.hour)}:${pad(clock.minute)}`,
      currentWeek,
      weekday,
      range,
      position: null
    };
    state.visible = selectedWeek === currentWeek && weekday >= 1 && weekday <= 7 && withinRange;
    if (state.visible) state.position = mapMinutesToPosition(minute, config.periodTimes);
    return state;
  };

  const api = Object.freeze({DEFAULT_METRICS, formatTime, isWithinVisibleTimeRange, mapDateToPosition, mapMinutesToPosition, minutesForDate, periodsFrom, schoolClock, stateFor, timeToMinutes, visibleRange});
  root.TimetableCurrentTime = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
