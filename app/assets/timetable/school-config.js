(function (root) {
  "use strict";
  const profileApi = root.AnyClassSchoolProfile || (typeof require === "function" ? require("./school-profile.js") : null);
  const registry = root.AnyClassSchoolProfileRegistry || profileApi?.registry;
  if (!profileApi || !registry) throw new Error("SCHOOL_PROFILE_CONTRACT_MISSING");
  const periodTimes = {1:{start:"08:00",end:"08:45"},2:{start:"08:55",end:"09:40"},3:{start:"10:00",end:"10:45"},4:{start:"10:55",end:"11:40"},5:{start:"14:00",end:"14:45"},6:{start:"14:55",end:"15:40"},7:{start:"16:00",end:"16:45"},8:{start:"16:55",end:"17:40"},9:{start:"18:30",end:"19:15"},10:{start:"19:25",end:"20:10"},11:{start:"20:20",end:"21:05"}};
  const demo = registry.register(profileApi.create({id:"school-demo",displayName:"Example University",profileVersion:"demo-v1",adapterId:"zhengfang-v9",adapterVersion:"legacy-v1",knownOrigins:["https://jw.example.edu"],timezone:"Asia/Shanghai",semesterMapping:{termCodes:{"3":"1","12":"2"}},semesterStartDate:"2026-08-31",totalWeeks:null,weekStart:1,periodDefinitions:periodTimes,campusAliases:{"Main Campus":"Main Campus","North Campus":"North Campus"},locationNormalizationVersion:"demo-location-v1"}));
  registry.setActive(demo.id);
  const profiles = Object.freeze({[demo.id]:demo});
  root.AnyClassDefaultSchoolProfileId=demo.id; root.AnyClassSchoolProfiles=profiles; root.TimetableSchoolConfigs=profiles;
  if(typeof module==="object"&&module.exports)module.exports=profiles;
})(typeof globalThis!=="undefined"?globalThis:this);
