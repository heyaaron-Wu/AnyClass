(function (root) {
  "use strict";

  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const periodKeys = value => Object.keys(value || {}).sort((a, b) => Number(a) - Number(b));
  const sameTimes = (left, right) => {
    const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
    return [...keys].every(key => left?.[key]?.start === right?.[key]?.start && left?.[key]?.end === right?.[key]?.end);
  };

  const validateProvided = value => {
    if (value === undefined) return null;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("上课时间必须是按节次编号的对象。");
    const result = {};
    let previous = null;
    for (const key of periodKeys(value)) {
      if (!/^(?:[1-9]|[12]\d|30)$/.test(key)) throw Error(`上课时间的节次 ${key} 无效，应为 1–30。`);
      const row = value[key];
      if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.start !== "string" || typeof row.end !== "string" || !clock.test(row.start) || !clock.test(row.end)) throw Error(`第 ${key} 节的时间格式无效，请使用 HH:mm 的开始和结束时间。`);
      if (minutes(row.start) >= minutes(row.end)) throw Error(`第 ${key} 节的结束时间必须晚于开始时间。`);
      if (previous && minutes(row.start) < minutes(previous.end)) throw Error(`第 ${key} 节与第 ${previous.key} 节的时间重叠。`);
      result[key] = {start: row.start, end: row.end};
      previous = {key, end: row.end};
    }
    return result;
  };

  const resolve = (provided, highest, defaults, providedSource = "JSON") => {
    if (!["JSON", "SOURCE_PAGE"].includes(providedSource)) throw Error("上课时间来源无效。");
    const source = validateProvided(provided);
    const fallback = defaults || {};
    const max = source ? Math.max(highest, ...Object.keys(source).map(Number)) : Math.max(highest, ...Object.keys(fallback).map(Number));
    const periodTimes = {}, periodTimeSources = {};
    for (let period = 1; period <= max; period += 1) {
      const key = String(period);
      const row = source && own(source, key) ? source[key] : fallback[key];
      if (!row) continue;
      periodTimes[key] = {start: row.start, end: row.end};
      periodTimeSources[key] = source && own(source, key) ? providedSource : "DEFAULT";
    }
    let previous = null;
    for (const key of periodKeys(periodTimes)) {
      const row = periodTimes[key];
      if (!clock.test(row.start) || !clock.test(row.end) || minutes(row.start) >= minutes(row.end)) throw Error(`第 ${key} 节的有效时间无效，请检查 JSON 时间或手动修改。`);
      if (previous && minutes(row.start) < minutes(previous.end)) throw Error(`第 ${key} 节与第 ${previous.key} 节的有效时间重叠；请修改 JSON 时间或补全默认时段。`);
      previous = {key, end: row.end};
    }
    return {periodTimes, periodTimeSources};
  };

  const api = Object.freeze({validateProvided, resolve, sameTimes});
  root.AnyClassImportPeriodTimes = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
