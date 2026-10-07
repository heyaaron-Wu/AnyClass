(function(root){
  "use strict";
  const normalize=value=>root.AnyClassCourseModel.normalizeCourseName(value);
  const sourceId=meeting=>String(meeting.sourceCourseId||"").trim();
  const groupKey=meeting=>sourceId(meeting)?`source:${sourceId(meeting)}`:`name:${normalize(meeting.courseName)}`;
  const groups=meetings=>{
    const found=new Map();
    (meetings||[]).forEach((meeting,index)=>{
      const key=groupKey(meeting);
      if(!found.has(key))found.set(key,{key,name:meeting.courseName,sourceId:sourceId(meeting),indices:[]});
      found.get(key).indices.push(index);
    });
    return [...found.values()];
  };
  const existingGroups=(courses,overrides=[])=>{
    const fields=new Map(overrides.map(row=>[row.courseId,row.fields||{}])),found=new Map();
    for(const row of courses.filter(item=>item.suppressed!==true)){
      const resolved={...row,...(fields.get(row.courseId)||{})},key=root.AnyClassCourseModel.logicalId(resolved);
      if(!found.has(key))found.set(key,{key,name:resolved.title,sourceKey:resolved.sourceKey||null,sourceId:sourceId(resolved.sourceRaw||{}),courses:[]});
      found.get(key).courses.push(resolved);
    }
    return [...found.values()];
  };
  const plan=(meetings,courses=[],overrides=[],sourceKey="",exactDuplicates=[])=>{
    const incoming=groups(meetings),existing=existingGroups(courses,overrides),conflicts=[];
    const exactByGroup=new Map();
    for(const item of exactDuplicates){const group=groups(meetings).find(row=>row.indices.includes(item.incomingIndex));if(!group)continue;if(!exactByGroup.has(group.key))exactByGroup.set(group.key,new Set());exactByGroup.get(group.key).add(item.incomingIndex)}
    for(const group of incoming){
      for(const other of incoming)if(group!==other&&normalize(group.name)===normalize(other.name)&&group.key>other.key)conflicts.push({kind:"INCOMING",incoming:group,other});
      for(const other of existing){
        if(normalize(group.name)!==normalize(other.name))continue;
        // A group made entirely of already-existing semantic meetings is handled once
        // by the exact-duplicate review, not again as a same-name course conflict.
        if(group.indices.every(index=>exactByGroup.get(group.key)?.has(index)))continue;
        // Reimport of the same source course is an update, not a new entity.
        if(other.sourceKey===sourceKey&&other.sourceId===group.sourceId)continue;
        conflicts.push({kind:"EXISTING",incoming:group,other});
      }
    }
    return {incoming,existing,conflicts,sourceKey,exactDuplicates};
  };
  const apply=(dataset,targetId,resolutions=new Map(),review=null)=>{
    const incoming=groups(dataset.meetings),chosen=new Map(),skip=new Set();
    const exactOwnerByGroup=new Map();
    for(const group of incoming){const exact=(review?.exactDuplicates||[]).filter(item=>group.indices.includes(item.incomingIndex));if(group.indices.every(index=>exact.some(item=>item.incomingIndex===index))){const owners=new Set(exact.map(item=>root.AnyClassCourseModel.logicalId(item.existing)));if(owners.size===1)exactOwnerByGroup.set(group.key,[...owners][0])}}
    if(review?.conflicts.some(item=>!resolutions.has(item.incoming.key)))throw Error("IMPORT_COURSE_NAME_REVIEW_REQUIRED");
    const resolve=(key,seen=new Set())=>{
      if(seen.has(key))throw Error("IMPORT_COURSE_MERGE_CYCLE");
      seen.add(key);
      const choice=resolutions.get(key);
      if(choice?.kind==="skip")throw Error("IMPORT_COURSE_MERGE_TARGET_SKIPPED");
      if(choice?.kind==="merge")return choice.targetGroupKey?resolve(choice.targetGroupKey,seen):choice.logicalCourseId;
      return exactOwnerByGroup.get(key)||`course:logical:${root.AnyClassPhaseB.idComponent([dataset.key,key])}`;
    };
    for(const group of incoming){
      const choice=resolutions.get(group.key);
      if(choice?.kind==="skip"){skip.add(group.key);continue;}
      const localId=resolve(group.key);
      if(!localId)throw Error("IMPORT_COURSE_MERGE_TARGET_MISSING");
      chosen.set(group.key,localId);
    }
    const meetings=dataset.meetings.filter(row=>!skip.has(groupKey(row))).map(row=>({...row,localLogicalCourseId:chosen.get(groupKey(row))}));
    if(!meetings.length)throw Error("IMPORT_ALL_COURSES_SKIPPED");
    if(review){
      const ownerByName=new Map();
      for(const group of groups(meetings)){
        const owner=chosen.get(group.key),name=normalize(group.name),prior=ownerByName.get(name);
        if(prior&&prior!==owner)throw Error("IMPORT_COURSE_NAME_STILL_DUPLICATED");
        ownerByName.set(name,owner);
      }
      for(const existing of review.existing){
        const name=normalize(existing.name),owner=ownerByName.get(name);
        const sameSource=existing.sourceKey===review.sourceKey&&incoming.some(group=>group.sourceId===existing.sourceId&&normalize(group.name)===name&&!skip.has(group.key));
        if(!owner||sameSource)continue;
        if(owner!==existing.key)throw Error("IMPORT_EXISTING_COURSE_NAME_STILL_DUPLICATED");
      }
    }
    return {...dataset,meetings};
  };
  const api=Object.freeze({normalize,groupKey,groups,existingGroups,plan,apply});
  root.AnyClassCourseNameReview=api;
  if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
