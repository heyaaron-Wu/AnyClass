(function(root){
  "use strict";
  // Schema 4 stores cross-course user intent in scheduleOverrides; source Courses remain untouched.
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const text=value=>String(value==null?"":value).trim();
  const sortedWeeks=value=>Array.isArray(value)?[...value].sort((a,b)=>a-b):[];
  const groups=model=>(model?.scheduleOverrides||[]).filter(row=>row?.kind==="session-group");
  const validate=(model,term,timetableId)=>{
    if(!model || !Array.isArray(model.courses) || !term?.periodTimes || !timetableId)throw Error("SESSION_GROUP_CONTEXT_INVALID");
    const courseById=new Map(model.courses.filter(row=>row.suppressed!==true).map(row=>[row.courseId,row]));
    const overrideById=new Map((model.courseOverrides||[]).map(row=>[row.courseId,row]));
    const used=new Set(),ids=new Set();
    return groups(model).map(row=>{
      if(!row.groupingId || row.scheduleOverrideId!==row.groupingId || ids.has(row.groupingId) || row.timetableId!==timetableId || !Array.isArray(row.memberCourseIds) || row.memberCourseIds.length<2 || new Set(row.memberCourseIds).size!==row.memberCourseIds.length || !Number.isInteger(row.nominalWeekday) || row.nominalWeekday<1 || row.nominalWeekday>7)throw Error("SESSION_GROUP_RECORD_INVALID");
      ids.add(row.groupingId);
      const members=row.memberCourseIds.map(id=>{
        if((model.occurrenceOverrides||[]).some(override=>override.courseId===id))throw Error("SESSION_GROUP_OCCURRENCE_REVIEW_REQUIRED");
        const source=courseById.get(id);
        if(!source || source.timetableId!==timetableId || used.has(id))throw Error("SESSION_GROUP_MEMBER_OWNER_CONFLICT");
        used.add(id);
        return {...source,...(overrideById.get(id)?.fields||{})};
      }).sort((a,b)=>a.startPeriod-b.startPeriod || a.courseId.localeCompare(b.courseId));
      const first=members[0],weeks=sortedWeeks(first.weeks);
      if(!weeks.length || !Number.isInteger(first.weekday) || first.weekday<1 || first.weekday>7 || members.some(item=>item.weekday!==first.weekday || !same(sortedWeeks(item.weeks),weeks)))throw Error("SESSION_GROUP_RECURRENCE_CONFLICT");
      if(members.some(item=>["title","teacher","location","notes"].some(field=>text(item[field])!==text(first[field]))))throw Error("SESSION_GROUP_DISPLAY_CONFLICT");
      for(let index=1;index<members.length;index++)if(members[index].startPeriod!==members[index-1].endPeriod+1)throw Error("SESSION_GROUP_PERIOD_GAP_OR_OVERLAP");
      const startPeriod=first.startPeriod,endPeriod=members.at(-1).endPeriod;
      if(!term.periodTimes[startPeriod]?.start || !term.periodTimes[endPeriod]?.end)throw Error("SESSION_GROUP_PERIOD_UNDEFINED");
      return {row,members,weeks,weekday:first.weekday,startPeriod,endPeriod,display:{title:first.title,teacher:first.teacher,location:first.location,notes:first.notes}};
    });
  };
  const apply=(sourceOccurrences,model,term,timetableId)=>{
    if(!Array.isArray(sourceOccurrences))throw Error("SESSION_GROUP_OCCURRENCES_REQUIRED");
    const descriptors=validate(model,term,timetableId);
    if(!descriptors.length)return sourceOccurrences;
    const consumed=new Set(),combined=[];
    for(const group of descriptors)for(const week of group.weeks){
      const matches=group.members.map(member=>{
        const found=sourceOccurrences.filter(item=>item.courseId===member.courseId && item.week===week);
        if(found.length!==1)throw Error("SESSION_GROUP_OCCURRENCE_MISSING_OR_DUPLICATE");
        return found[0];
      });
      if(new Set(matches.map(item=>item.effectiveDate)).size!==1)throw Error("SESSION_GROUP_DATE_CONFLICT");
      for(const item of matches)consumed.add(item.occurrenceId);
      const nominalDate=root.AnyClassEffectiveOccurrences.addDays(term.semesterStartDate,(week-1)*7+group.row.nominalWeekday-1);
      const occurrenceId=`grouped:${root.AnyClassPhaseB.idComponent([group.row.groupingId,nominalDate])}`;
      combined.push({...matches[0],occurrenceId,finalOccurrenceId:occurrenceId,groupingId:group.row.groupingId,memberCourseIds:[...group.row.memberCourseIds],sourceOrdinal:Math.min(...matches.map(item=>item.sourceOrdinal)),sourceMeetingId:null,nominalDate,startPeriod:group.startPeriod,endPeriod:group.endPeriod,startTime:term.periodTimes[group.startPeriod].start,endTime:term.periodTimes[group.endPeriod].end,title:group.display.title,courseName:group.display.title,teacher:group.display.teacher,location:group.display.location,notes:group.display.notes,sourceIdentity:{groupingId:group.row.groupingId,memberCourseIds:[...group.row.memberCourseIds]},uidIdentity:{courseName:group.row.groupingId,weekday:1,startPeriod:1,endPeriod:1,locationRaw:"",week}});
    }
    const result=[...sourceOccurrences.filter(item=>!consumed.has(item.occurrenceId)),...combined].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.startTime.localeCompare(b.startTime)||a.sourceOrdinal-b.sourceOrdinal||a.occurrenceId.localeCompare(b.occurrenceId));
    if(new Set(result.map(item=>item.occurrenceId)).size!==result.length)throw Error("SESSION_GROUP_DUPLICATE_OCCURRENCE");
    return result;
  };
  const api=Object.freeze({groups,validate,apply});root.AnyClassSessionGrouping=api;
  if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
