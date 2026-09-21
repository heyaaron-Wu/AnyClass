(function (root) {
  "use strict";

  const attachGraph = (dataset, graph, courseModel, effectiveOccurrences, effectiveContext) => {
    if (!dataset || !graph || !courseModel || !effectiveOccurrences) throw new Error("SCHEMA3_RUNTIME_REQUIRED");
    Object.defineProperty(dataset, "__phaseBGraph", {value: graph, enumerable: false, configurable: false, writable: false});
    Object.defineProperty(dataset, "__courseModel", {value: courseModel, enumerable: false, configurable: false, writable: false});
    Object.defineProperty(dataset, "__effectiveOccurrences", {value: effectiveOccurrences, enumerable: false, configurable: false, writable: false});
    Object.defineProperty(dataset, "__effectiveContext", {value: effectiveContext, enumerable: false, configurable: false, writable: false});
    return dataset;
  };

  const latestDataset = async schoolId => {
    if (!root.AnyClassStorageV2 || !root.AnyClassPhaseB || !root.AnyClassEffectiveOccurrences || !root.TimetableSchoolConfigs) throw new Error("SCHEMA3_STORAGE_DEPENDENCY_MISSING");
    const config = root.TimetableSchoolConfigs[schoolId];
    if (!config) throw new Error("SCHOOL_CONFIG_MISSING");
    const result = await root.AnyClassStorageV2.ensureLatest(schoolId, config);
    if (!result) return null;
    const courseModel = await root.AnyClassStorageV2.readCourseModel(root.AnyClassCourseModel.sourceKey(result.dataset));
    const effectiveContext = {
      semesterStartDate: result.graph.term.semesterStartDate,
      timezone: result.graph.term.timezone,
      periodTimes: result.graph.term.periodTimes,
      totalWeeks: result.graph.term.totalWeeks
    };
    const effectiveOccurrences = root.AnyClassEffectiveOccurrences.build(courseModel, effectiveContext);
    return attachGraph(result.dataset, result.graph, courseModel, effectiveOccurrences, effectiveContext);
  };

  const diagnostics = async schoolId => {
    const result = await root.AnyClassStorageV2.ensureLatest(schoolId, root.TimetableSchoolConfigs[schoolId]);
    return result ? {
      schemaVersion: 3,
      activeTermId: result.graph.term.termId,
      profileSnapshotVersion: result.graph.term.schoolProfileSnapshot.schoolProfileVersion,
      adapterId: result.graph.term.schoolProfileSnapshot.adapterId,
      adapterVersion: result.graph.term.schoolProfileSnapshot.adapterVersion,
      engineVersion: root.AnyClassPhaseB.ENGINE_VERSION
    } : null;
  };

  root.TimetableStorage = Object.freeze({diagnostics, latestDataset});
})(typeof globalThis !== "undefined" ? globalThis : this);
