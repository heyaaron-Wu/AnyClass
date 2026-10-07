(function (root) {
  "use strict";

  const api = () => {
    if (!root.AnyClassStorageV2 || !root.AnyClassSchoolProfileRegistry) throw new Error("PHASE_B_STORAGE_DEPENDENCY_MISSING");
    return root.AnyClassStorageV2;
  };

  const validateCalendarContext = (dataset, context) => {
    const date = String(context?.semesterStartDate || "");
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date || parsed.getUTCDay() !== 1) throw new Error("FILE_SEMESTER_START_MONDAY_REQUIRED");
    const timezone = String(context?.timezone || "").trim();
    try { new Intl.DateTimeFormat("en", {timeZone:timezone}); } catch (_) { throw new Error("FILE_TIMEZONE_INVALID"); }
    if (!timezone) throw new Error("FILE_TIMEZONE_INVALID");
    const times = context?.periodTimes || {};
    const highest = Math.max(...dataset.meetings.map(meeting => meeting.endPeriod));
    if (typeof times !== "object" || Array.isArray(times)) throw new Error("FILE_PERIOD_TIMES_INVALID");
    const periodTimes = {};
    let priorEnd = -1;
    for (const [key,item] of Object.entries(times).sort(([a],[b])=>Number(a)-Number(b))) {
      const period = Number(key);
      if (!Number.isInteger(period) || period < 1 || period > Math.max(highest,root.AnyClassDefaultPeriodTimes?.highest||0)) throw new Error("FILE_PERIOD_TIMES_INVALID");
      if (!item || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end) || item.start >= item.end) throw new Error("FILE_PERIOD_TIMES_INVALID");
      const startMinutes=Number(item.start.slice(0,2))*60+Number(item.start.slice(3));
      if(startMinutes<priorEnd)throw Error("FILE_PERIOD_TIMES_OVERLAP");
      priorEnd=Number(item.end.slice(0,2))*60+Number(item.end.slice(3));
      periodTimes[period] = {start:item.start,end:item.end};
    }
    const timingStatus = Array.from({length:highest},(_,index)=>periodTimes[index+1]).every(Boolean) ? "COMPLETE" : "INCOMPLETE";
    return {semesterStartDate:date,timezone,periodTimes,timingStatus};
  };
  const configForDataset = dataset => {
    const profile = root.AnyClassSchoolProfileRegistry.get(dataset?.school?.id);
    if (profile && !dataset.calendarContext) return profile;
    const calendar = validateCalendarContext(dataset,dataset.calendarContext);
    const maxPeriod = Math.max(...dataset.meetings.map(meeting=>meeting.endPeriod),...Object.keys(calendar.periodTimes).map(Number));
    return {semesterStartDate:calendar.semesterStartDate,periodTimes:calendar.periodTimes,timingStatus:calendar.timingStatus,maxPeriod,preserveExistingPeriodTimesWhenDefault:root.AnyClassDefaultPeriodTimes?.isDefault(calendar.periodTimes)===true,snapshot(totalWeeks) { return {schoolId:dataset.school.id,schoolName:dataset.school.name,schoolProfileVersion:"file-local-v1",adapterId:"file",adapterVersion:"1",timezone:calendar.timezone,semesterStartDate:calendar.semesterStartDate,totalWeeks,weekStart:1,periodTimes:calendar.periodTimes,timingStatus:calendar.timingStatus,maxPeriod,semesterSourceMapping:{},campusAliases:{},locationNormalizationVersion:"none"}; }};
  };
  // A validated AnyClass file is the complete exported timetable for its term.
  const putDataset = (dataset, factory = indexedDB, hooks = {}) => api().putLegacyAndMigrate({...dataset,completeness:"COMPLETE"},configForDataset(dataset),factory,hooks);
  const getDataset = (key, factory = indexedDB) => api().getLegacyDataset(key, factory);
  const countKey = (key, factory = indexedDB) => api().countLegacyKey(key, factory);

  const storage=Object.freeze({putDataset,getDataset,countKey,validateCalendarContext,configForDataset});
  root.AnyClassTimetableFileStorage=storage;
  root.HeyAaronTimetableFileStorage=storage;
})(typeof globalThis !== "undefined" ? globalThis : this);
