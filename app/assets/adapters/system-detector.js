(function (root) {
  "use strict";
  const OUTCOMES = Object.freeze({MATCH: "MATCH", LOW_CONFIDENCE: "LOW_CONFIDENCE", UNSUPPORTED: "UNSUPPORTED", AMBIGUOUS: "AMBIGUOUS"});
  const result = (outcome, candidate, evidenceCodes = []) => Object.freeze({outcome, family: candidate?.family || null, version: candidate?.version || null, confidence: candidate?.confidence || 0, adapterId: candidate?.adapterId || null, evidenceCodes: [...evidenceCodes], schoolProfileCandidates: [...(candidate?.schoolProfileCandidates || [])]});
  const detect = (input, registry = root.AnyClassAdapterRegistry) => {
    if (!registry) throw new Error("ADAPTER_REGISTRY_REQUIRED");
    const candidates = registry.list().map(entry => entry.adapter.detect(input)).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
    const matches = candidates.filter(item => item.outcome === OUTCOMES.MATCH);
    if (matches.length > 1 && matches[0].confidence === matches[1].confidence) return result(OUTCOMES.AMBIGUOUS, null, [...new Set(matches.flatMap(item => item.evidenceCodes))]);
    if (matches.length >= 1) return result(OUTCOMES.MATCH, matches[0], matches[0].evidenceCodes);
    const low = candidates.find(item => item.outcome === OUTCOMES.LOW_CONFIDENCE);
    return low ? result(OUTCOMES.LOW_CONFIDENCE, low, low.evidenceCodes) : result(OUTCOMES.UNSUPPORTED, null, []);
  };
  root.AnyClassSystemDetector = Object.freeze({OUTCOMES, detect});
  if (typeof module === "object" && module.exports) module.exports = root.AnyClassSystemDetector;
})(typeof globalThis !== "undefined" ? globalThis : this);
