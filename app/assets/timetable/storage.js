(function (root) {
  "use strict";

  const attachGraph = (dataset, graph, courseModel, effectiveOccurrences, effectiveContext, sourceOccurrences) => {
    if (!dataset || !graph || !courseModel || !effectiveOccurrences) throw new Error("SCHEMA3_RUNTIME_REQUIRED");
    Object.defineProperty(dataset, "__phaseBGraph", {value: graph, enumerable: false, configurable: false, writable: false});
    Object.defineProperty(dataset, "__courseModel", {value: courseModel, enumerable: false, configurable: false, writable: false});
    Object.defineProperty(dataset, "__effectiveOccurrences", {value: effectiveOccurrences, enumerable: false, configurable: false, writable: false});
    Object.defineProperty(dataset, "__sourceEffectiveOccurrences", {value: sourceOccurrences, enumerable: false, configurable: false, writable: false});
    Object.defineProperty(dataset, "__effectiveContext", {value: effectiveContext, enumerable: false, configurable: false, writable: false});
    return dataset;
  };

  const datasetFromBundle = bundle => {
    if (!root.AnyClassTimetableRepository || !root.AnyClassEffectiveOccurrences) throw new Error("SCHEMA4_STORAGE_DEPENDENCY_MISSING");
    if (!bundle?.term || !bundle?.model) return null;
    if (!bundle.dataset && !bundle.model.courses.some(row => row.sourceType === "manual")) return null;
    const graph = {schemaVersion:2,timetable:bundle.table,term:bundle.term,baseMeetings:bundle.meetings};
    const courseModel = bundle.model;
    const effectiveContext = {
      semesterStartDate: bundle.term.semesterStartDate,
      timezone: bundle.term.timezone,
      periodTimes: bundle.term.periodTimes,
      timingStatus: bundle.term.timingStatus || "COMPLETE",
      totalWeeks: bundle.term.totalWeeks
    };
    const sourceOccurrences = root.AnyClassEffectiveOccurrences.build(courseModel, effectiveContext);
    const effectiveOccurrences = root.AnyClassSessionGrouping.apply(sourceOccurrences,courseModel,bundle.term,bundle.table.timetableId);
    const dataset = bundle.dataset ? JSON.parse(JSON.stringify(bundle.dataset)) : {schemaVersion:1,source:"manual",meetings:[]};
    for (const course of courseModel.courses.filter(row => row.sourceType === "manual")) dataset.meetings.push({courseName:course.title,weekday:course.weekday,startPeriod:course.startPeriod,endPeriod:course.endPeriod,weeks:[...course.weeks],teacher:course.teacher,locationRaw:course.location});
    const profile = bundle.term.schoolProfileSnapshot || {};
    Object.defineProperty(dataset,"__runtimeProfile",{value:{...profile,...(profile.schoolId ? {id:profile.schoolId,name:profile.schoolName} : {}),sourceType:bundle.term.sourceType,semesterStartDate:bundle.term.semesterStartDate,periodTimes:bundle.term.periodTimes,timingStatus:bundle.term.timingStatus || "COMPLETE",timezone:bundle.term.timezone},enumerable:false});
    return attachGraph(dataset, graph, courseModel, effectiveOccurrences, effectiveContext, sourceOccurrences);
  };
  const activeDataset = async () => {
    if (!root.AnyClassTimetableRepository) throw new Error("SCHEMA4_STORAGE_DEPENDENCY_MISSING");
    return datasetFromBundle(await root.AnyClassTimetableRepository.readActiveBundle());
  };
  const timetableDataset = async id => {
    if (!root.AnyClassTimetableRepository) throw new Error("SCHEMA4_STORAGE_DEPENDENCY_MISSING");
    return datasetFromBundle(await root.AnyClassTimetableRepository.readTimetableBundle(id));
  };

  const latestDataset = activeDataset;

  const diagnostics = async schoolId => {
    const active = await root.AnyClassTimetableRepository.readActiveBundle();
    return active?.term ? {
      schemaVersion: 4,
      activeTimetableId:active.table.timetableId,
      activeTermId: active.term.termId,
      profileSnapshotVersion: active.term.schoolProfileSnapshot?.schoolProfileVersion || null,
      adapterId: active.term.schoolProfileSnapshot?.adapterId || null,
      adapterVersion: active.term.schoolProfileSnapshot?.adapterVersion || null,
      engineVersion: root.AnyClassPhaseB.ENGINE_VERSION
    } : null;
  };

  root.TimetableStorage = Object.freeze({diagnostics, activeDataset, timetableDataset, latestDataset});
})(typeof globalThis !== "undefined" ? globalThis : this);
