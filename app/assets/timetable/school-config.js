(function (root) {
  "use strict";
  const periodTimes = Object.freeze({
    1: Object.freeze({start: "08:00", end: "08:45"}), 2: Object.freeze({start: "08:55", end: "09:40"}),
    3: Object.freeze({start: "10:00", end: "10:45"}), 4: Object.freeze({start: "10:55", end: "11:40"}),
    5: Object.freeze({start: "14:30", end: "15:15"}), 6: Object.freeze({start: "15:25", end: "16:10"}),
    7: Object.freeze({start: "16:25", end: "17:10"}), 8: Object.freeze({start: "17:15", end: "18:00"}),
    9: Object.freeze({start: "19:15", end: "20:00"}), 10: Object.freeze({start: "20:01", end: "20:45"}),
    11: Object.freeze({start: "20:46", end: "21:30"})
  });
  const campusAliases = Object.freeze({"本部": "广东邮电职业技术学院广州校区", "广州校区": "广东邮电职业技术学院广州校区"});
  const normalizeLocation = value => {
    const input = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
    for (const [alias, canonical] of Object.entries(campusAliases)) {
      if (input === alias) return canonical;
      if (input.startsWith(`${alias} `)) return `${canonical}${input.slice(alias.length)}`;
    }
    return input;
  };
  const gupt = Object.freeze({
    id: "gupt", name: "广东邮电职业技术学院", profileVersion: "gupt-2026-1",
    adapterId: "zhengfang-v9", adapterVersion: "legacy-v1",
    knownOrigins: Object.freeze(["https://www.gupt.edu.cn"]), timezone: "Asia/Shanghai",
    semesterMapping: Object.freeze({termCodes: Object.freeze({"3": "1", "12": "2"})}),
    semesterStartDate: "2026-08-31", totalWeeks: null, weekStart: 1, periodTimes, campusAliases,
    locationNormalizationVersion: "gupt-location-v1", normalizeLocation,
    snapshot(totalWeeks) {
      return Object.freeze({schoolId: this.id, schoolName: this.name, schoolProfileVersion: this.profileVersion,
        adapterId: this.adapterId, adapterVersion: this.adapterVersion, timezone: this.timezone,
        semesterStartDate: this.semesterStartDate, totalWeeks, weekStart: this.weekStart,
        periodTimes: JSON.parse(JSON.stringify(this.periodTimes)),
        semesterSourceMapping: JSON.parse(JSON.stringify(this.semesterMapping)),
        campusAliases: JSON.parse(JSON.stringify(this.campusAliases)),
        locationNormalizationVersion: this.locationNormalizationVersion});
    }
  });
  const profiles = Object.freeze({gupt});
  root.AnyClassSchoolProfiles = profiles;
  root.TimetableSchoolConfigs = profiles;
  if (typeof module === "object" && module.exports) module.exports = profiles;
})(typeof globalThis !== "undefined" ? globalThis : this);
