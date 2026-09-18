(function (root) {
  "use strict";

  const attachGraph = (dataset, graph) => {
    if (!dataset || !graph) return dataset;
    Object.defineProperty(dataset, "__phaseBGraph", {value: graph, enumerable: false, configurable: false, writable: false});
    return dataset;
  };

  const latestDataset = async schoolId => {
    if (!root.AnyClassStorageV2 || !root.AnyClassPhaseB || !root.TimetableSchoolConfigs) throw new Error("PHASE_B_STORAGE_DEPENDENCY_MISSING");
    const config = root.TimetableSchoolConfigs[schoolId];
    if (!config) throw new Error("SCHOOL_CONFIG_MISSING");
    const result = await root.AnyClassStorageV2.ensureLatest(schoolId, config);
    return result ? attachGraph(result.dataset, result.graph) : null;
  };

  const diagnostics = async schoolId => {
    const result = await root.AnyClassStorageV2.ensureLatest(schoolId, root.TimetableSchoolConfigs[schoolId]);
    return result ? {
      schemaVersion: 2,
      activeTermId: result.graph.term.termId,
      profileSnapshotVersion: result.graph.term.schoolProfileSnapshot.schoolProfileVersion,
      adapterId: result.graph.term.schoolProfileSnapshot.adapterId,
      adapterVersion: result.graph.term.schoolProfileSnapshot.adapterVersion,
      engineVersion: root.AnyClassPhaseB.ENGINE_VERSION
    } : null;
  };

  root.TimetableStorage = Object.freeze({diagnostics, latestDataset});
})(typeof globalThis !== "undefined" ? globalThis : this);
