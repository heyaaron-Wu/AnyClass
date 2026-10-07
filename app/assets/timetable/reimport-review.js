/* A review session holds only staged choices. Phase 4A remains the sole writer. */
(() => {
  "use strict";
  const labels={title:"课程名称",teacher:"教师",location:"地点",weekday:"星期",weeks:"周次",startPeriod:"开始节次",endPeriod:"结束节次",notes:"备注"};
  const groupingReasons={SESSION_GROUP_RECURRENCE_CONFLICT:"上课星期或周次范围发生变化",SESSION_GROUP_PERIOD_GAP_OR_OVERLAP:"节次不再相邻",SESSION_GROUP_MEMBER_OWNER_CONFLICT:"分组中的课程已从来源消失或不再属于当前课表",SESSION_GROUP_DISPLAY_CONFLICT:"课程名称、教师、地点或备注不再一致",SESSION_GROUP_PERIOD_UNDEFINED:"部分节次缺少上课时间",SESSION_GROUP_DATE_CONFLICT:"分组课程不再安排在同一天",SESSION_GROUP_OCCURRENCE_MISSING_OR_DUPLICATE:"分组中的某次课无法安全对应"};
  const display=value=>Array.isArray(value)?value.join("、"):value===null||value===undefined||value===""?"未填写":String(value);
  const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
  const root=document.getElementById("reimportReview");
  if(!root)return;
  const summary=document.getElementById("reimportReviewSummary"),list=document.getElementById("reimportReviewItems"),progress=document.getElementById("reimportReviewProgress"),commitButton=document.getElementById("reimportReviewCommit"),cancelButton=document.getElementById("reimportReviewCancel"),feedback=document.getElementById("reimportReviewFeedback");
  let session=null;
  const reveal=(text,kind)=>{feedback.textContent=text;feedback.className=`reimport-review-feedback ${kind||""}`;feedback.hidden=!text;};
  const close=()=>{root.hidden=true;document.body.classList.remove("reimport-review-active");list.replaceChildren();reveal("");session=null;};
  const fieldKey=item=>`${item.courseId}:${item.field}`;
  const requiredCount=()=>session.result.conflicts.filter(item=>item.type==="FIELD_CONFLICT").length+session.result.sourceMissingItems.length+session.result.orphanedOccurrenceOverrides.length+session.result.invalidatedGroupings.length+session.result.conflicts.filter(item=>item.type!=="FIELD_CONFLICT").length;
  const resolvedCount=()=>session.result.conflicts.filter(item=>item.type==="FIELD_CONFLICT"&&session.choices.has(fieldKey(item))).length+session.result.sourceMissingItems.filter(item=>session.acknowledged.has(item.courseId)).length;
  const updateProgress=()=>{const remaining=requiredCount()-resolvedCount();progress.textContent=remaining?`${remaining} 项待确认 · 已确认 ${resolvedCount()} / ${requiredCount()}`:`${requiredCount()} 项已确认，可以更新课表`;commitButton.disabled=remaining>0||session.busy||session.stale;};
  const addValue=(parent,label,value)=>{const box=node("div","reimport-review-value");box.append(node("strong","",label),node("p","",display(value)));parent.append(box);return box;};
  const render=()=>{
    const result=session.result;list.replaceChildren();
    const field=result.conflicts.filter(item=>item.type==="FIELD_CONFLICT");
    summary.textContent=`可自动更新 ${result.sourceUpdatedCourses||0} 门 · 新增课程 ${result.newCourses||0} 门 · 需要确认 ${requiredCount()} 项${result.sourceMissingCourses?` · 来源已移除 ${result.sourceMissingCourses} 门`:""}`;
    for(const item of field){
      const card=node("article","reimport-review-card"),title=node("h3","",item.courseTitle||"课程更新"),heading=node("p","reimport-review-field",`${labels[item.field]||"课程信息"}发生变化`),compare=node("div","reimport-review-compare");
      card.append(title,heading);const mine=addValue(compare,"你的修改",item.currentUserValue),source=addValue(compare,`${session.sourceLabel}最新内容`,item.newSourceValue);
      for(const [box,choice,label] of [[mine,"KEEP_MINE","保留我的修改"],[source,"ADOPT_SOURCE","使用最新内容"]]){
        const button=node("button","reimport-review-choice",label);button.type="button";button.setAttribute("aria-label",`${item.courseTitle||"课程"}，${labels[item.field]||"课程信息"}，${label}`);button.setAttribute("aria-pressed",String(session.choices.get(fieldKey(item))===choice));button.addEventListener("click",()=>{session.choices.set(fieldKey(item),choice);for(const other of compare.querySelectorAll("button"))other.setAttribute("aria-pressed",String(other===button));updateProgress();});box.append(button);
      }
      card.append(compare);const prior=node("p","reimport-review-prior",`原来的内容：${display(item.previousSourceValue)}`);card.append(prior);list.append(card);
    }
    for(const item of result.sourceMissingItems||[]){
      const card=node("article","reimport-review-card"),heading=node("h3","",item.courseTitle||"一门课程"),copy=node("p","",`这门课程已不在${session.sourceLabel}的最新课表中。更新后会保留记录，但不再显示在当前课表中。${item.hasUserChanges?"你对此课程的修改也会保留。":""}`),label=node("label","reimport-review-ack"),input=node("input");input.type="checkbox";input.checked=session.acknowledged.has(item.courseId);input.addEventListener("change",()=>{if(input.checked)session.acknowledged.add(item.courseId);else session.acknowledged.delete(item.courseId);updateProgress();});label.append(input,document.createTextNode("我已了解这门课程的变化"));card.append(heading,copy,label);list.append(card);
    }
    for(const item of result.orphanedOccurrenceOverrides||[]){const card=node("article","reimport-review-card reimport-review-blocked"),detail=[item.nominalDate?`原定 ${item.nominalDate}${item.week?`（第 ${item.week} 周）`:""}`:"",item.modifiedDate?`你改到了 ${item.modifiedDate}`:"",item.modifiedStartPeriod?`第 ${item.modifiedStartPeriod}${item.modifiedEndPeriod?`–${item.modifiedEndPeriod}`:""} 节`:""].filter(Boolean).join("，");card.append(node("h3","",`${item.courseTitle||"一门课程"}的一次课需要进一步核对`),node("p","",`原来修改过的一次课无法安全对应到最新课表。${detail?`${detail}。`:""}本次更新不能继续；请取消并检查来源。`));list.append(card);}
    for(const item of result.invalidatedGroupings||[]){const card=node("article","reimport-review-card reimport-review-blocked");card.append(node("h3","","课程分组需要进一步核对"),node("p","",`${groupingReasons[item.reason]||"课程安排发生变化"}。为保护你的分组，本次更新暂不能继续。`));list.append(card);}
    for(const item of result.conflicts.filter(value=>value.type!=="FIELD_CONFLICT")){const card=node("article","reimport-review-card reimport-review-blocked");card.append(node("h3","","课程对应关系需要进一步核对"),node("p","","来源中的课程与已有课程无法安全对应。本次更新不会修改现有课表。"));list.append(card);}
    updateProgress();root.hidden=false;document.body.classList.add("reimport-review-active");root.scrollIntoView({block:"start",behavior:"instant"});root.querySelector("h2")?.focus();
  };
  const attempt=async options=>{
    session.busy=true;updateProgress();reveal("");
    let result;
    try{result=await session.commit(options);}
    catch(error){if(error?.message==="REIMPORT_MERGE_REVIEW_REQUIRED"&&error.mergeResult){session.result=error.mergeResult;session.busy=false;render();}else{session.busy=false;if(root.hidden){const onFailure=session.onFailure;close();onFailure?.(error);}else{if(error?.message==="REIMPORT_REVIEW_STALE")session.stale=true;updateProgress();reveal(session.stale?"课表内容已在其他页面变化。请取消本次更新，然后重新导入。":"更新未完成，原有课表未被修改。可以重试或取消。","error");}}return;}
    const onSuccess=session.onSuccess;close();await onSuccess(result);
  };
  commitButton.addEventListener("click",()=>{if(!session||commitButton.disabled)return;attempt({requireSourceMissingReview:true,sourceMissingApproved:true,expectedReviewSignature:session.result.reviewSignature,mergeResolutions:Object.fromEntries(session.choices)});});
  cancelButton.addEventListener("click",()=>{const onCancel=session?.onCancel;close();onCancel?.();});
  window.AnyClassReimportReview=Object.freeze({
    async start({commit,onSuccess,onCancel,onFailure,sourceLabel="教务系统"}){
      if(session)close();
      session={commit,onSuccess,onCancel,onFailure,sourceLabel,result:{conflicts:[],sourceMissingItems:[],orphanedOccurrenceOverrides:[],invalidatedGroupings:[]},choices:new Map(),acknowledged:new Set(),busy:false,stale:false};
      await attempt({requireSourceMissingReview:true});
    },
    close
  });
})();
