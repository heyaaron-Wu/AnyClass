(function (root) {
  "use strict";
  const requiredText = (value, field) => { const text = String(value == null ? "" : value).trim(); if (!text) throw new TypeError(`SCHOOL_PROFILE_${field.toUpperCase()}_REQUIRED`); return text; };
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalizeOrigin = value => { const url = new URL(requiredText(value, "origin")),loopback=["localhost","127.0.0.1","[::1]"].includes(url.hostname); if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback)) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new TypeError("SCHOOL_PROFILE_ORIGIN_INVALID"); return url.origin; };
  const create = definition => {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) throw new TypeError("SCHOOL_PROFILE_REQUIRED");
    const id = requiredText(definition.id, "id"), displayName = requiredText(definition.displayName || definition.name, "displayName");
    const origins = [...new Set((definition.knownOrigins || []).map(normalizeOrigin))];
    if (!origins.length) throw new TypeError("SCHOOL_PROFILE_ORIGINS_REQUIRED");
    const periodTimes = Object.freeze(clone(definition.periodDefinitions || definition.periodTimes || {}));
    if (!Object.keys(periodTimes).length) throw new TypeError("SCHOOL_PROFILE_PERIODS_REQUIRED");
    const aliases = Object.freeze(clone(definition.campusAliases || {}));
    const defaultNormalize = value => { const input = String(value == null ? "" : value).trim().replace(/\s+/g, " "); for (const [alias, canonical] of Object.entries(aliases)) { if (input === alias) return canonical; if (input.startsWith(`${alias} `)) return `${canonical}${input.slice(alias.length)}`; } return input; };
    const profile = {id, displayName, name: displayName, profileVersion: requiredText(definition.profileVersion, "profileVersion"), adapterId: requiredText(definition.adapterId, "adapterId"), adapterVersion: requiredText(definition.adapterVersion, "adapterVersion"), knownOrigins: Object.freeze(origins), timezone: requiredText(definition.timezone || "UTC", "timezone"), semesterMapping: Object.freeze(clone(definition.semesterMapping || {})), semesterStartDate: requiredText(definition.semesterStartDate, "semesterStartDate"), totalWeeks: definition.totalWeeks == null ? null : Number(definition.totalWeeks), weekStart: Number(definition.weekStart || 1), periodDefinitions: periodTimes, periodTimes, campusAliases: aliases, locationNormalizationVersion: requiredText(definition.locationNormalizationVersion || "generic-v1", "locationNormalizationVersion"), normalizeLocation: typeof definition.normalizeLocation === "function" ? definition.normalizeLocation : defaultNormalize, adapterEvidence: definition.adapterEvidence && typeof definition.adapterEvidence === "object" ? Object.freeze({...definition.adapterEvidence}) : null,
      allowsOrigin(origin) { try { return origins.includes(new URL(origin).origin); } catch (_) { return false; } },
      snapshot(totalWeeks) { return Object.freeze({schoolId: id, schoolName: displayName, schoolProfileVersion: this.profileVersion, adapterId: this.adapterId, adapterVersion: this.adapterVersion, timezone: this.timezone, semesterStartDate: this.semesterStartDate, totalWeeks, weekStart: this.weekStart, periodTimes: clone(this.periodTimes), semesterSourceMapping: clone(this.semesterMapping), campusAliases: clone(this.campusAliases), locationNormalizationVersion: this.locationNormalizationVersion}); }
    };
    return Object.freeze(profile);
  };
  const records = new Map(); let activeId = null;
  const registry = Object.freeze({register(profile) { const value = profile && typeof profile.snapshot === "function" ? profile : create(profile); if (records.has(value.id)) throw new Error("SCHOOL_PROFILE_DUPLICATE"); records.set(value.id, value); if (!activeId) activeId = value.id; return value; }, get(id) { return records.get(String(id || "")) || null; }, list() { return Object.freeze([...records.values()]); }, setActive(id) { if (!records.has(id)) throw new Error("SCHOOL_PROFILE_UNKNOWN"); activeId = id; return records.get(id); }, getActive() { return activeId ? records.get(activeId) || null : null; }, matchOrigin(origin, adapterId) { return this.list().filter(profile => (!adapterId || profile.adapterId === adapterId) && profile.allowsOrigin(origin)); }});
  root.AnyClassSchoolProfile = Object.freeze({create}); root.AnyClassSchoolProfileRegistry = registry;
  if (typeof module === "object" && module.exports) module.exports = Object.freeze({create, registry});
})(typeof globalThis !== "undefined" ? globalThis : this);
