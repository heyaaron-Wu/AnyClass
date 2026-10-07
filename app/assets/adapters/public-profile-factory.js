(function(root){
  "use strict";
  const create=({origin,adapterId,adapterVersion,timezone,periodDefinitions,semesterMapping={termCodes:{"3":"1","12":"2"}}})=>root.AnyClassSchoolProfile.create({id:`public-${adapterId}`,displayName:"待确认学校",profileVersion:"public-generic-v1",adapterId,adapterVersion,knownOrigins:[origin],timezone:timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC",semesterMapping,semesterStartDate:"1970-01-05",totalWeeks:null,weekStart:1,periodDefinitions,campusAliases:{},locationNormalizationVersion:"public-generic-v1",adapterEvidence:{schoolIdentity:"USER_CONFIRMATION_REQUIRED"}});
  const api=Object.freeze({create});root.AnyClassPublicProfileFactory=api;if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
