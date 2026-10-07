(() => {
  "use strict";
  const BUILD_ID = "closure-reopen-20260918";
  window.__ANYCLASS_TIMETABLE_BUILD__ = BUILD_ID;
  document.documentElement.dataset.timetableBuild = BUILD_ID;
  const $ = id => document.getElementById(id);
  let baseConfig = AnyClassSchoolProfileRegistry.getActive();
  let config = baseConfig;
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  let dataset = null;
  let selectedWeek = 1;
  let maxWeek = 1;
  let currentState = null;
  let minuteTimer = null;
  let initialScrollPending = true;
  let refreshRevision = 0;
  let resizeFrame = null;
  let selectedCourseId = null;
  let selectedOccurrenceId = null;
  let editingBusy = false;
  const closeDialog = dialog => AnyClassMotion?.closeDialog ? AnyClassMotion.closeDialog(dialog) : Promise.resolve((dialog.close(), true));
  const reveal = node => { if (node && !node.hidden) AnyClassMotion?.reveal?.(node); };


  const syncVisiblePeriodConfig = weekOccurrences => {
    if (!dataset) return;
    const periodView = AnyClassPeriodPreferences.effective(baseConfig, dataset, {weekOccurrences});
    config = {...baseConfig, periodTimes: periodView.periodTimes};
  };

  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  };

  const detailRow = (label, value) => {
    const row = el("div", "dialog-row");
    row.append(el("dt", null, label), el("dd", null, value || "未提供"));
    return row;
  };

  const courseContext = () => {
    const course = dataset?.__courseModel?.courses.find(row => row.courseId === selectedCourseId);
    const override = dataset?.__courseModel?.courseOverrides.find(row => row.courseId === selectedCourseId);
    const term = dataset?.__phaseBGraph?.term;
    return course && term ? {course,override,term,resolved:AnyClassCourseEditing.resolved(course,override)} : null;
  };

  const renderCourseDetail = () => {
    const context = courseContext();
    if (!context) return;
    const course = context.resolved, times = context.term.periodTimes;
    const effective = dataset.__effectiveOccurrences.find(row => row.occurrenceId === selectedOccurrenceId);
    const visible = effective || course;
    $("dialogTitle").textContent = visible.title;
    $("dialogDetails").replaceChildren(
      detailRow("星期", days[visible.weekday - 1]),
      detailRow("节次", TimetableTodayView.periodLabel(visible)),
      detailRow("时间", effective?.startTime && effective?.endTime ? `${effective.startTime}–${effective.endTime}` : times[course.startPeriod]?.start && times[course.endPeriod]?.end ? `${times[course.startPeriod].start}–${times[course.endPeriod].end}` : "尚未设置"),
      detailRow("周次", `${course.weeks.join("、")}周`),
      detailRow("地点", TimetableTodayView.normalizeDisplayLocation(visible.location)),
      detailRow("教师", visible.teacher),
      detailRow("备注", visible.notes)
    );
    const grouped=effective?.groupingId || dataset.__courseModel.scheduleOverrides.find(row=>row.kind==="session-group"&&row.memberCourseIds.includes(context.course.courseId))?.groupingId;
    if(grouped)$("dialogDetails").append(detailRow("节次合并",`已合并为第 ${effective?.startPeriod || course.startPeriod}–${effective?.endPeriod || course.endPeriod} 节`));
    $("editCourse").hidden = false;
    $("editOccurrence").hidden=Boolean(grouped)||!effective;
    $("cancelOccurrence").hidden=Boolean(grouped)||!effective;
    $("groupedOccurrenceNotice").hidden=!grouped;
    $("groupCourse").hidden=Boolean(grouped);
    $("ungroupCourse").hidden=!grouped;
    $("ungroupCourse").dataset.groupingId=grouped || "";
    $("deleteManualCourse").hidden = context.course.sourceType !== "manual" || Boolean(grouped);
  };

  const openCourse = item => {
    selectedCourseId = item.meeting.courseId || null;
    selectedOccurrenceId = item.finalOccurrenceId || null;
    $("dialogAdjusted").hidden = !item.meeting.isAdjusted;
    $("dialogStatusRow").hidden = !item.meeting.isAdjusted;
    $("courseEditForm").hidden = true;
    $("courseDetailView").hidden = false;
    if (selectedCourseId) renderCourseDetail();
    else {
      $("editCourse").hidden = true;
      $("editOccurrence").hidden=true;$("cancelOccurrence").hidden=true;$("groupedOccurrenceNotice").hidden=true;
      $("groupCourse").hidden=true;$("ungroupCourse").hidden=true;
      $("deleteManualCourse").hidden = true;
      $("dialogTitle").textContent = item.meeting.courseName || "未命名课程";
      $("dialogDetails").replaceChildren(detailRow("星期", days[item.weekday - 1]),detailRow("节次", TimetableTodayView.periodLabel(item.meeting)),detailRow("时间", item.startText && item.endText ? `${item.startText}–${item.endText}` : "尚未设置"),detailRow("周次", `${item.meeting.weeks.join("、")}周`),detailRow("地点", item.meeting.locationRaw),detailRow("教师", item.meeting.teacher),detailRow("备注", item.meeting.notes));
    }
    const dialog = $("courseDialog");
    AnyClassMotion.openDialog(dialog,{focus:$("closeDialog")});
  };

  const resolvedCourses=()=>{
    if(!dataset?.__courseModel)return [];
    const overrides=new Map(dataset.__courseModel.courseOverrides.map(row=>[row.courseId,row]));
    return dataset.__courseModel.courses.filter(row=>row.suppressed!==true).map(row=>AnyClassCourseEditing.resolved(row,overrides.get(row.courseId)));
  };
  const groupCandidates=()=>{
    const grouped=new Set(dataset.__courseModel.scheduleOverrides.filter(row=>row.kind==="session-group").flatMap(row=>row.memberCourseIds));
    const anchor=resolvedCourses().find(row=>row.courseId===selectedCourseId);
    if(!anchor)return [];
    return resolvedCourses().filter(row=>!grouped.has(row.courseId)&&row.weekday===anchor.weekday&&JSON.stringify([...row.weeks].sort((a,b)=>a-b))===JSON.stringify([...anchor.weeks].sort((a,b)=>a-b))).sort((a,b)=>a.startPeriod-b.startPeriod||a.courseId.localeCompare(b.courseId));
  };
  const updateGroupPreview=()=>{
    const selected=[...$("groupCandidateList").querySelectorAll("input:checked")].map(input=>input.value);
    const preview=$("groupPreview"),save=$("saveGroupCourse");save.disabled=true;
    if(selected.length<2){preview.textContent="请至少选择两段节次。";return}
    const model=dataset.__courseModel,first=resolvedCourses().find(row=>row.courseId===selected[0]);
    const row={scheduleOverrideId:"preview",groupingId:"preview",kind:"session-group",timetableId:dataset.__phaseBGraph.timetable.timetableId,memberCourseIds:selected,nominalWeekday:first.weekday};
    try{const result=AnyClassSessionGrouping.validate({...model,scheduleOverrides:[...model.scheduleOverrides,row]},dataset.__phaseBGraph.term,row.timetableId).at(-1);preview.textContent=`合并为第 ${result.startPeriod}–${result.endPeriod} 节 · ${dataset.__phaseBGraph.term.periodTimes[result.startPeriod].start}–${dataset.__phaseBGraph.term.periodTimes[result.endPeriod].end}`;save.disabled=false}
    catch(error){preview.textContent=error.message.includes("DISPLAY")?"课程名称、教师、地点或备注不一致，无法直接合并。":error.message.includes("PERIOD")?"节次存在间隔或重叠，无法合并。":"所选课程目前不符合合并条件。"}
  };
  const openGroupCourse=()=>{
    const list=$("groupCandidateList");list.replaceChildren();
    for(const course of groupCandidates()){
      const label=el("label","group-candidate"),input=document.createElement("input"),times=dataset.__phaseBGraph.term.periodTimes;
      input.type="checkbox";input.value=course.courseId;input.checked=course.courseId===selectedCourseId;
      label.append(input,el("span",null,`${course.title} · ${days[course.weekday-1]} · 第 ${course.startPeriod}–${course.endPeriod} 节 · ${times[course.startPeriod]?.start || "—"}–${times[course.endPeriod]?.end || "—"} · ${course.weeks.join("、")}周 · ${course.teacher || "教师未提供"} · ${course.location || "地点未提供"}`));
      list.append(label);
    }
    $("groupCourseError").hidden=true;updateGroupPreview();$("groupCourseDialog").showModal();list.querySelector("input")?.focus();
  };

  const editField = (field,label,control,value,source,overridden) => {
    const wrap = el("div","course-edit-field");
    const head = el("div","course-edit-field-header");
    const fieldLabel = el("label",null,label);
    fieldLabel.htmlFor = `edit-${field}`;
    fieldLabel.id = `edit-label-${field}`;
    control.id = `edit-${field}`;
    control.dataset.editField = field;
    if (field === "weeks") { control.setAttribute("role","group"); control.setAttribute("aria-labelledby",fieldLabel.id); }
    if (control.tagName === "INPUT" || control.tagName === "TEXTAREA" || control.tagName === "SELECT") control.value = value == null ? "" : String(value);
    const restore = el("button","restore-field","恢复原值");
    restore.type = "button";
    restore.hidden = !overridden;
    restore.setAttribute("aria-label",`恢复${label}原值`);
    restore.addEventListener("click", () => {
      if (field === "weeks") control.setWeeks(source);
      else control.value = source == null ? "" : String(source);
      restore.hidden = true;
      updatePeriodPreview();
    });
    head.append(fieldLabel,restore);
    wrap.append(head,control);
    return wrap;
  };
  const selectControl = (values,current) => {
    const select = document.createElement("select");
    for (const [value,label] of values) select.add(new Option(label,String(value)));
    select.value = String(current);
    return select;
  };
  const formatSelectedWeeks = weeks => {
    const sorted=[...new Set(weeks)].sort((a,b)=>a-b),parts=[];
    for(let index=0;index<sorted.length;){let end=index;while(end+1<sorted.length&&sorted[end+1]===sorted[end]+1)end++;parts.push(end>index?`${sorted[index]}–${sorted[end]}`:String(sorted[index]));index=end+1}
    return sorted.length?`${parts.join("、")}周`:"未选择周次";
  };
  const weekPicker = (total,initialWeeks) => {
    const box=el("div","course-edit-week-box"),summary=el("p","course-edit-week-summary"),toolbar=el("div","course-edit-week-actions"),grid=el("div","course-edit-week-grid");
    summary.setAttribute("role","status");summary.setAttribute("aria-live","polite");
    const update=()=>{summary.textContent=`已选：${formatSelectedWeeks([...grid.querySelectorAll("input:checked")].map(input=>Number(input.value)))}`};
    for(const [label,checked] of [["全选",true],["清空",false]]){const button=el("button",null,label);button.type="button";button.addEventListener("click",()=>{for(const input of grid.querySelectorAll("input"))input.checked=checked;update()});toolbar.append(button)}
    for(let week=1;week<=total;week++){const label=el("label"),check=document.createElement("input");check.type="checkbox";check.value=String(week);check.checked=initialWeeks.includes(week);check.addEventListener("change",update);label.append(check,document.createTextNode(String(week)));grid.append(label)}
    box.setWeeks=weeks=>{for(const input of grid.querySelectorAll("input"))input.checked=weeks.includes(Number(input.value));update()};
    box.append(summary,toolbar,grid);update();return box;
  };
  const updatePeriodPreview = () => {
    const context = courseContext();
    if (!context) return;
    const start = Number(document.querySelector('[data-edit-field="startPeriod"]')?.value), end = Number(document.querySelector('[data-edit-field="endPeriod"]')?.value);
    const hint = $("periodPreview");
    if (hint) hint.textContent = start <= end ? `${context.term.periodTimes[start]?.start || "—"} — ${context.term.periodTimes[end]?.end || "—"}` : "结束节次不能早于开始节次";
  };
  const openCourseEditor = () => {
    const context = courseContext();
    if (!context) return;
    const {course,override,term,resolved} = context, changed = override?.fields || {}, root = $("courseEditFields");
    root.replaceChildren();
    for (const [field,label,kind] of [["title","课程名称","input"],["teacher","教师","input"],["location","地点","input"],["notes","备注","textarea"]]) {
      const control = document.createElement(kind);
      if (kind === "input") control.type = "text";
      control.maxLength = field === "notes" ? 1000 : 200;
      root.append(editField(field,label,control,resolved[field],course[field],Object.hasOwn(changed,field)));
    }
    root.append(editField("weekday","星期",selectControl(days.map((name,index)=>[index+1,name]),resolved.weekday),resolved.weekday,course.weekday,Object.hasOwn(changed,"weekday")));
    const weekBox = weekPicker(term.totalWeeks,resolved.weeks);
    root.append(editField("weeks","上课周次",weekBox,resolved.weeks,course.weeks,Object.hasOwn(changed,"weeks")));
    const periodOptions = Object.keys(term.periodTimes).map(Number).sort((a,b)=>a-b).map(period=>[period,`第 ${period} 节`]);
    for (const [field,label] of [["startPeriod","开始节次"],["endPeriod","结束节次"]]) root.append(editField(field,label,selectControl(periodOptions,resolved[field]),resolved[field],course[field],Object.hasOwn(changed,field)));
    const hint = el("p","field-hint");hint.id="periodPreview";root.append(hint);
    for (const field of ["startPeriod","endPeriod"]) document.querySelector(`[data-edit-field="${field}"]`).addEventListener("change",updatePeriodPreview);
    updatePeriodPreview();
    $("courseEditError").hidden=true;
    $("courseDetailView").hidden=true;
    $("courseEditForm").hidden=false;
    reveal($("courseEditForm"));
    $("edit-title").focus();
  };
  const occurrenceBaseline=()=>{
    const context=courseContext();if(!context||!selectedOccurrenceId)return null;
    return AnyClassEffectiveOccurrences.build({schemaVersion:3,snapshots:[],courses:[context.course],courseOverrides:context.override?[context.override]:[],occurrenceOverrides:[],scheduleOverrides:[]},dataset.__effectiveContext).find(row=>row.occurrenceId===selectedOccurrenceId)||null;
  };
  const occurrenceDraft=()=>{
    const form=$("occurrenceEditForm"),value=field=>form.querySelector(`[data-occurrence-field="${field}"]`).value;
    return {title:value("title"),teacher:value("teacher"),location:value("location"),effectiveDate:value("effectiveDate"),startPeriod:Number(value("startPeriod")),endPeriod:Number(value("endPeriod")),notes:value("notes"),cancelled:form.querySelector('[data-occurrence-field="cancelled"]').checked};
  };
  const updateOccurrenceWarnings=()=>{
    const hint=$("occurrenceOverlap"),draft=occurrenceDraft();
    const collisions=dataset.__effectiveOccurrences.filter(row=>row.occurrenceId!==selectedOccurrenceId&&row.effectiveDate===draft.effectiveDate&&draft.startPeriod<=row.endPeriod&&row.startPeriod<=draft.endPeriod);
    hint.hidden=!collisions.length||draft.cancelled;hint.textContent=collisions.length?`与 ${collisions.length} 节其他课程时间重叠；保存不会修改其他课程。`:"";
  };
  const openOccurrenceEditor=(cancel=false)=>{
    const baseline=occurrenceBaseline(),current=dataset?.__effectiveOccurrences.find(row=>row.occurrenceId===selectedOccurrenceId),context=courseContext();
    if(!baseline||!current||!context||current.groupingId){$("refreshNotice").textContent="合并节次请先取消合并，再修改单次课程。";$("refreshNotice").hidden=false;return}
    const fields=$("occurrenceEditFields"),changed=dataset.__courseModel.occurrenceOverrides.find(row=>row.occurrenceId===selectedOccurrenceId)?.fields||{};
    fields.replaceChildren();$("occurrenceScope").textContent=`仅本次课程 · 原定 ${baseline.nominalDate}（第 ${baseline.week} 周）· 当前 ${current.effectiveDate} · 第 ${current.startPeriod}–${current.endPeriod} 节`;
    for(const [field,label,kind] of [["title","课程名称","text"],["teacher","教师","text"],["location","地点","text"],["effectiveDate","本次日期","date"],["startPeriod","开始节次","select"],["endPeriod","结束节次","select"],["notes","备注","textarea"],["cancelled","取消本次课程","checkbox"]]){
      const wrap=el("div","course-edit-field"),head=el("div","course-edit-field-header"),heading=el("label",null,label),input=kind==="textarea"?document.createElement("textarea"):kind==="select"?selectControl(Object.keys(context.term.periodTimes).map(Number).sort((a,b)=>a-b).map(period=>[period,`第 ${period} 节`]),current[field]):document.createElement("input");
      input.id=`occurrence-${field}`;input.dataset.occurrenceField=field;heading.htmlFor=input.id;
      if(kind==="checkbox")input.type="checkbox";else if(kind!=="textarea"&&kind!=="select")input.type=kind;
      if(kind==="checkbox")input.checked=cancel||current.cancelled===true;else input.value=current[field]??"";
      if(kind==="text"||kind==="textarea")input.maxLength=field==="notes"?1000:200;
      head.append(heading);
      if(Object.hasOwn(changed,field)){const restore=el("button","restore-field","恢复本次原值");restore.type="button";restore.setAttribute("aria-label",`恢复本次${label}原值`);restore.addEventListener("click",()=>{if(kind==="checkbox")input.checked=false;else input.value=baseline[field]??"";restore.hidden=true;updateOccurrenceWarnings()});head.append(restore)}
      wrap.append(head,input);fields.append(wrap);
    }
    fields.oninput=updateOccurrenceWarnings;fields.onchange=updateOccurrenceWarnings;
    $("occurrenceEditError").hidden=true;$("courseDetailView").hidden=true;$("occurrenceEditForm").hidden=false;reveal($("occurrenceEditForm"));updateOccurrenceWarnings();$("occurrence-title").focus();
  };
  const readCourseDraft = (container = $("courseEditForm")) => {
    const value = field => container.querySelector(`[data-edit-field="${field}"]`).value;
    return {title:value("title"),teacher:value("teacher"),location:value("location"),notes:value("notes"),weekday:Number(value("weekday")),weeks:[...container.querySelectorAll('[data-edit-field="weeks"] input:checked')].map(input=>Number(input.value)),startPeriod:Number(value("startPeriod")),endPeriod:Number(value("endPeriod"))};
  };

  let createTable = null, createTerm = null, createPeriodTimes = null, manualScheduleEditor = null, pendingCreate = null;
  const createField = (field,label,control) => {
    const wrap=el("div","course-edit-field"), heading=el("label",null,label);
    control.id=`create-${field}`;control.dataset.editField=field;heading.htmlFor=control.id;
    if (field==="weeks") { heading.id="create-weeks-label";control.setAttribute("role","group");control.setAttribute("aria-labelledby",heading.id); }
    wrap.append(heading,control);return wrap;
  };
  const renderCreateForm = () => {
    const root=$("createCourseFields"),previous={};
    for(const field of ["title","teacher","location","notes","weekday","startPeriod","endPeriod"])previous[field]=root.querySelector(`[data-edit-field="${field}"]`)?.value;
    const previousWeeks=new Set([...root.querySelectorAll('[data-edit-field="weeks"] input:checked')].map(item=>Number(item.value)));
    root.replaceChildren();
    for (const [field,label,kind] of [["title","课程名称","input"],["teacher","教师（可选）","input"],["location","地点（可选）","input"],["notes","备注（可选）","textarea"]]) {
      const control=document.createElement(kind);if(kind==="input")control.type="text";control.maxLength=field==="notes"?1000:200;control.value=previous[field] || "";
      root.append(createField(field,label,control));
    }
    root.append(createField("weekday","星期",selectControl(days.map((name,index)=>[index+1,name]),previous.weekday || 1)));
    const total=createTerm?.totalWeeks || Number($("manualTotalWeeks").value) || 18;
    root.append(createField("weeks","上课周次",weekPicker(total,[...previousWeeks])));
    const periods=Object.keys(createPeriodTimes).map(Number).sort((a,b)=>a-b).map(period=>[period,`第 ${period} 节`]);
    for(const [field,label] of [["startPeriod","开始节次"],["endPeriod","结束节次"]])root.append(createField(field,label,selectControl(periods,previous[field] || periods[0][0])));
    const preview=el("p","field-hint");preview.id="createPeriodPreview";root.append(preview);
    const update=()=>{const a=Number($("create-startPeriod").value),b=Number($("create-endPeriod").value);preview.textContent=a<=b?`${createPeriodTimes[a]?.start || "—"} — ${createPeriodTimes[b]?.end || "—"}`:"结束节次不能早于开始节次"};
    $("create-startPeriod").addEventListener("change",update);$("create-endPeriod").addEventListener("change",update);update();
  };
  const showCreateError = message => {$("createCourseError").textContent=message;$("createCourseError").hidden=false};
  const createCollisions = async (draft, context) => {
    const active = await AnyClassTimetableRepository.getActiveTimetable();
    if (active?.timetableId !== createTable?.timetableId) throw Error("MANUAL_COURSE_ACTIVE_OWNER_CONFLICT");
    const term = createTerm || context;
    const checked = AnyClassCourseEditing.normalized(draft,term);
    const existing = (await TimetableStorage.activeDataset())?.__effectiveOccurrences || [];
    const collisions = [];
    for (const week of checked.weeks) {
      const date = AnyClassEffectiveOccurrences.addDays(term.semesterStartDate,(week-1)*7+checked.weekday-1);
      for (const row of existing) if (row.effectiveDate===date && checked.startPeriod<=row.endPeriod && row.startPeriod<=checked.endPeriod) {
        const startPeriod=Math.max(checked.startPeriod,row.startPeriod),endPeriod=Math.min(checked.endPeriod,row.endPeriod);
        collisions.push({newCourse:checked,existing:row,date,week,startPeriod,endPeriod,startTime:term.periodTimes[startPeriod]?.start,endTime:term.periodTimes[endPeriod]?.end});
      }
    }
    return collisions;
  };
  const showCreateConflictReview = (collisions,nameMatches=[]) => {
    const list=$("createConflictItems");list.replaceChildren();
    const owners=new Set(nameMatches.map(row=>AnyClassCourseModel.logicalId(row)));
    $("createConflictTitle").textContent=nameMatches.length?"课程名称已存在":"保存前确认时间冲突";
    $("createConflictSummary").textContent=nameMatches.length
      ? owners.size>1?"旧数据中有不同实体使用同一课程名称。原记录已保留，请先人工归并或修改新课程名称。":`当前课表已有“${nameMatches[0].title}”。可明确选择将本次上课时间添加到已有课程，或返回修改名称。${collisions.length?`另有 ${collisions.length} 处时间重叠。`:""}`
      : `发现 ${collisions.length} 处重叠。两门课程都可保留；请先核对课程、日期与节次，再决定是否保存。`;
    $("attachConflictCreate").hidden=!nameMatches.length||owners.size!==1;
    $("confirmConflictCreate").hidden=Boolean(nameMatches.length);
    for (const item of collisions) {
      const card=el("div","course-conflict-item"),newName=el("strong",null,`新课程：${item.newCourse.title}`);
      const existingName=el("p",null,`已有课程：${item.existing.title || item.existing.courseName || "未命名课程"}`);
      const time=el("p",null,`${item.date}（第 ${item.week} 周）· 重叠第 ${item.startPeriod}–${item.endPeriod} 节${item.startTime&&item.endTime ? `（${item.startTime}–${item.endTime}）` : ""}`);
      const details=el("p",null,`新课程：第 ${item.newCourse.startPeriod}–${item.newCourse.endPeriod} 节${item.newCourse.location ? ` · ${item.newCourse.location}` : ""}；已有课程：第 ${item.existing.startPeriod}–${item.existing.endPeriod} 节${typeof item.existing.location==="string"&&item.existing.location ? ` · ${item.existing.location}` : ""}`);
      card.append(newName,existingName,time,details);list.append(card);
    }
    $("createCourseForm").hidden=true;$("createConflictReview").hidden=false;reveal($("createConflictReview"));$("createConflictError").hidden=true;
    $("createConflictTitle").focus();
  };
  const commitCreate = async (entry, errorNode = $("createCourseError")) => {
    if (editingBusy || !entry) return;
    editingBusy=true;$("saveCreateCourse").disabled=true;$("confirmConflictCreate").disabled=true;errorNode.hidden=true;
    try {
      const active=await AnyClassTimetableRepository.getActiveTimetable();
      if (active?.timetableId!==entry.timetableId) throw Error("MANUAL_COURSE_ACTIVE_OWNER_CONFLICT");
      await AnyClassTimetableRepository.createManualCourse(entry.timetableId,entry.draft,entry.context);
      pendingCreate=null;await closeDialog($("createCourseDialog"));
      await refreshTimetableData();AnyClassShell.dispatchTimetableUpdated({reason:"manual-course-create"});
    } catch (error) {
      const code=String(error?.message||"");
      errorNode.textContent=code.includes("NAME")?"课程名称与当前课表中的另一门课程重复，请返回修改或核对已有课程。":code.includes("TITLE")?"课程名称不能为空。":code.includes("WEEK")?"请选择有效周次和总周数。":code.includes("PERIOD")?"请选择有效节次。":code.includes("MONDAY")?"请选择第 1 周的星期一。":code.includes("CONFIRM")?"请确认当前节次时间。":code.includes("OWNER")?"当前课表已切换，请重新打开添加课程。":"添加失败，课程未被保存。";
      errorNode.hidden=false;
    } finally {editingBusy=false;$("saveCreateCourse").disabled=false;$("confirmConflictCreate").disabled=false;}
  };
  const openCreateCourse = async () => {
    try {
      createTable=await AnyClassTimetableRepository.getActiveTimetable();
      if(!createTable)throw Error("TIMETABLE_REQUIRED");
      const bundle=await AnyClassTimetableRepository.readTimetableBundle(createTable.timetableId);
      createTerm=bundle?.term || null;
      createPeriodTimes=createTerm?.periodTimes || AnyClassDefaultPeriodTimes.clone();
      if(!Object.keys(createPeriodTimes).length)throw Error("MANUAL_PERIODS_REQUIRED");
      $("manualContextFields").hidden=Boolean(createTerm);
      manualScheduleEditor=createTerm?null:AnyClassScheduleTimes.editor($("manualScheduleEditor"),Math.max(...Object.keys(createPeriodTimes).map(Number)),createPeriodTimes);
      $("manualTotalWeeks").value="18";$("manualContextConfirm").checked=false;
      $("createCourseFields").replaceChildren();
      const now=new Date(), monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
      $("manualStartDate").value=TimetableCore.formatDate(monday);
      pendingCreate=null;$("createConflictReview").hidden=true;$("createCourseForm").hidden=false;
      renderCreateForm();$("createCourseError").hidden=true;$("createCourseDialog").showModal();$("create-title").focus();
    }catch(_error){$("refreshNotice").textContent="请先新建课表并配置有效节次。";$("refreshNotice").hidden=false}
  };

  const closeCourse = () => {
    const dialog = $("courseDialog");
    void AnyClassMotion.closeDialog(dialog);
  };
  AnyClassMotion.enableSheetDismiss($("courseDialog"),{scrollContainer:$("courseDialog").querySelector(".dialog-body"),close:()=>AnyClassMotion.closeDialog($("courseDialog"))});

  const cardContent = (item, isCurrent) => {
    const fragment = document.createDocumentFragment();
    const title = el("strong", null, item.meeting.courseName || "未命名课程");
    if (item.meeting.isAdjusted) title.prepend("调 · ");
    fragment.append(title, el("span", null, item.startText && item.endText ? `${item.startText}–${item.endText}` : TimetableTodayView.periodLabel(item.meeting)), el("span", null, TimetableTodayView.normalizeDisplayLocation(item.meeting.locationRaw) || "地点未提供"));
    if (isCurrent) fragment.append(el("span", "live-label", "进行中"));
    return fragment;
  };

  const courseButton = (item, className, isCurrent) => {
    const button = el("button", className);
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    if (isCurrent) button.setAttribute("aria-label", `${item.meeting.courseName || "未命名课程"}，进行中`);
    button.append(cardContent(item, isCurrent));
    button.addEventListener("click", () => openCourse(item));
    return button;
  };

  const openConflictGroup = group => {
    const list = $("conflictGroupItems");
    list.replaceChildren();
    for (const item of group.items) {
      const button = el("button","conflict-group-item");
      button.type = "button";
      button.append(el("strong",null,item.meeting.courseName || "未命名课程"),el("span",null,`${TimetableTodayView.periodLabel(item.meeting)} · ${TimetableTodayView.normalizeDisplayLocation(item.meeting.locationRaw) || "地点未提供"}`));
      button.addEventListener("click",async()=>{await closeDialog($("conflictGroupDialog"));openCourse(item)});
      list.append(button);
    }
    $("conflictGroupTitle").textContent = `${group.items.length} 门课程时间冲突`;
    $("conflictGroupDialog").showModal();
    list.querySelector("button")?.focus({preventScroll:true});
  };

  const timeMarker = (state, variant) => {
    const marker = el("div", `current-time-indicator ${variant}-time`);
    marker.setAttribute("aria-label", `当前时间 ${state.timeText}`);
    marker.append(el("time", "current-time-text", state.timeText));
    if (variant === "desktop") {
      const track = el("span", "current-time-track");
      track.style.gridColumn = String(state.weekday + 1);
      track.append(el("span", "current-time-dot"), el("span", "current-time-rule"));
      marker.append(track);
    } else {
      marker.append(el("span", "current-time-dot"), el("span", "current-time-rule"));
    }
    return marker;
  };

  const renderGrid = (layout, state, currentMeetings) => {
    const grid = $("weekGrid");
    grid.replaceChildren();
    const periods = Object.keys(config.periodTimes).map(Number).sort((a,b)=>a-b);
    grid.style.setProperty("--visible-period-count", String(periods.length));
    const corner = el("div", "corner", "节次");
    corner.style.gridColumn = "1";
    corner.style.gridRow = "1";
    grid.append(corner);
    days.forEach((name, index) => {
      const head = el("div", `day-head${state.visible && index + 1 === state.weekday ? " today" : ""}`, name);
      head.style.gridColumn = String(index + 2);
      head.style.gridRow = "1";
      grid.append(head);
    });
    for (const period of periods) {
      const time = config.periodTimes[period];
      const label = el("div", "period-label");
      label.append(el("div", null, period));
      if (time.start) label.firstChild.append(el("small", null, time.start));
      label.style.gridColumn = "1";
      label.style.gridRow = String(periods.indexOf(period) + 2);
      grid.append(label);
    }
    for (let day = 1; day <= 7; day += 1) {
      const column = el("div", "day-column");
      column.style.gridColumn = String(day + 1);
      column.style.gridRow = `2 / span ${periods.length}`;
      for (const group of layout.groups.filter(entry => entry.weekday === day)) {
        if (group.startPeriod > periods.at(-1)) continue;
        if (group.items.length > 1) {
          const button=el("button","course-card conflict-group-card");
          button.type="button";
          button.setAttribute("aria-haspopup","dialog");
          button.setAttribute("aria-label",`${days[day-1]}第 ${group.startPeriod}–${group.endPeriod} 节，${group.items.length} 门课程时间冲突，查看课程`);
          button.append(el("strong",null,`${group.items.length} 门课程冲突`),el("span",null,`第 ${group.startPeriod}–${group.endPeriod} 节`),el("span",null,"点击查看全部课程"));
          button.style.gridRow=`${group.startPeriod} / ${Math.min(group.endPeriod,periods.at(-1))+1}`;
          button.addEventListener("click",()=>openConflictGroup(group));
          column.append(button);
          continue;
        }
        const item=group.items[0];
        const isCurrent = currentMeetings.has(item.meeting);
        const card = courseButton(item, `course-card${item.meeting.isAdjusted ? " adjusted" : ""}${isCurrent ? " current" : ""}`, isCurrent);
        card.style.gridRow = `${item.meeting.startPeriod} / ${Math.min(item.meeting.endPeriod,periods.at(-1)) + 1}`;
        column.append(card);
      }
      grid.append(column);
    }
    const markerAllowed = state.visible && state.position &&
      TimetableCurrentTime.isWithinVisibleTimeRange(
        TimetableCurrentTime.schoolClock(new Date(), config.timezone).minutes,
        config.periodTimes
      );
    if (markerAllowed) {
      const marker = timeMarker(state, "desktop");
      marker.style.setProperty("--time-y", `${state.position.y}px`);
      grid.append(marker);
    }
  };

  const renderMobile = (items, state, currentMeetings) => {
    const list = $("mobileWeekList");
    list.replaceChildren();
    const visibleMeetingCount = items.length;
    for (let day = 1; day <= 7; day += 1) {
      const dayItems = items.filter(item => item.weekday === day);
      const isToday = state.visible && day === state.weekday;
      if (!dayItems.length && !isToday) continue;
      const group = el("section", "mobile-day");
      const heading = el("h2", isToday ? "today" : null, days[day - 1]);
      const date = TimetableCore.occurrenceDate(selectedWeek, day, config);
      heading.append(el("span", null, `${date.getMonth() + 1}月${date.getDate()}日`));
      group.append(heading);
      for (const item of dayItems) {
        const isCurrent = currentMeetings.has(item.meeting);
        const card=courseButton(item, `mobile-course${item.meeting.isAdjusted ? " adjusted" : ""}${item.laneCount > 1 ? " conflicting" : ""}${isCurrent ? " current" : ""}`, isCurrent);
        if(item.laneCount>1)card.setAttribute("aria-label",`${item.meeting.courseName || "未命名课程"}，与其他课程时间冲突`);
        group.append(card);
      }
      list.append(group);
    }
    const empty = $("mobileEmpty");
    empty.hidden = visibleMeetingCount !== 0;
    empty.setAttribute("aria-hidden", visibleMeetingCount === 0 ? "false" : "true");
  };

  const visibleTimeMarker = () => [...document.querySelectorAll(".current-time-indicator")].find(node => node.offsetParent !== null);

  const scrollToCurrent = force => {
    const marker = visibleTimeMarker();
    if (!marker) return;
    const bounds = marker.getBoundingClientRect();
    const outsideComfortZone = bounds.top < 120 || bounds.bottom > window.innerHeight - 120;
    if (!force && !outsideComfortZone) return;
    marker.scrollIntoView({block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  };

  const updateReturnNow = () => {
    if (!currentState) return;
    const available = currentState.currentWeek >= 1 && currentState.currentWeek <= maxWeek;
    $("returnNow").textContent = "回到本周";
    $("returnNow").hidden = !available || selectedWeek === currentState.currentWeek;
  };

  const render = (options = {}) => {
    const model=dataset.__courseModel||{courses:[],courseOverrides:[]},overrides=new Map((model.courseOverrides||[]).map(row=>[row.courseId,row.fields||{}]));
    const duplicateNames=new Set(AnyClassCourseModel.nameConflicts((model.courses||[]).map(row=>({...row,...(overrides.get(row.courseId)||{})}))).map(item=>item.name));
    $("legacyNameNotice").hidden=!duplicateNames.size;
    if(duplicateNames.size)$("legacyNameNotice").textContent=`旧课表有 ${duplicateNames.size} 个同名课程需要人工核对归并。原记录已保留；不会自动合并或删除。`;
    const cancelled=dataset.__courseModel?.occurrenceOverrides.filter(row=>row.fields?.cancelled===true)||[],$panel=$("cancelledOccurrences"),list=$("cancelledOccurrenceList");
    list.replaceChildren();$panel.hidden=!cancelled.length;
    for(const row of cancelled){const course=dataset.__courseModel.courses.find(item=>item.courseId===row.courseId),entry=el("div","cancelled-occurrence"),label=el("span",null,`${course?.title||"课程"} · 原定 ${row.nominalDate||"日期待核对"}`),restore=el("button","button","恢复本次课程");restore.type="button";restore.addEventListener("click",async()=>{restore.disabled=true;try{await AnyClassTimetableRepository.restoreOccurrenceField(row.occurrenceId,row.courseId,"cancelled");await refreshTimetableData();AnyClassShell.dispatchTimetableUpdated({reason:"occurrence-restore"})}catch(_){$("refreshNotice").textContent="恢复失败，本机数据未被修改。";$("refreshNotice").hidden=false}finally{restore.disabled=false}});entry.append(label,restore);list.append(entry)}
    document.querySelectorAll(".current-time-indicator").forEach(node => node.remove());
    selectedWeek = Math.max(1, Math.min(maxWeek, selectedWeek));
    const fullConfig = {...baseConfig, periodTimes: AnyClassPeriodPreferences.definitions(baseConfig)};
    const raw = TimetableCore.meetingsForWeek(dataset, selectedWeek, fullConfig);
    syncVisiblePeriodConfig(raw);
    const now = new Date();
    currentState = baseConfig.timingStatus === "INCOMPLETE" ? {visible:false,position:null,weekday:TimetableCore.weekday(now),timeText:""} : TimetableCurrentTime.stateFor(now, config, selectedWeek, TimetableCore);
    $("weekTitle").textContent = `第 ${selectedWeek} 周`;
    const monday = TimetableCore.occurrenceDate(selectedWeek, 1, config);
    const sunday = TimetableCore.occurrenceDate(selectedWeek, 7, config);
    $("weekRange").textContent = `${TimetableCore.formatDate(monday)} 至 ${TimetableCore.formatDate(sunday)}`;
    $("previous").disabled = selectedWeek <= 1;
    $("next").disabled = selectedWeek >= maxWeek;
    const layout = TimetableCore.layoutWeek(raw);
    const currentMeetings = currentState.visible
      ? new Set(TimetableCore.analyze(dataset, now, config).currentClasses.map(item => item.meeting))
      : new Set();
    $("conflictCount").hidden = !layout.scheduleConflictCount;
    $("conflictCount").textContent = `${layout.scheduleConflictCount} 组冲突`;
    renderGrid(layout, currentState, currentMeetings);
    if (!currentState.visible) document.querySelectorAll(".current-time-indicator").forEach(node => node.remove());
    const visibleEndPeriod = Math.max(...Object.keys(config.periodTimes).map(Number));
    renderMobile(layout.items.filter(item => item.meeting.startPeriod <= visibleEndPeriod), currentState, currentMeetings);
    updateReturnNow();
    if (options.scrollToNow || (initialScrollPending && currentState.visible)) {
      initialScrollPending = false;
      setTimeout(() => {
        scrollToCurrent(Boolean(options.scrollToNow));
        updateReturnNow();
      }, 0);
    }
  };

  const renderWeekChange=()=>{render();reveal($("weekGrid"));reveal($("mobileWeekList"))};
  $("previous").addEventListener("click", () => { selectedWeek -= 1; renderWeekChange(); });
  $("next").addEventListener("click", () => { selectedWeek += 1; renderWeekChange(); });
  $("returnNow").addEventListener("click", () => {
    const now = new Date();
    selectedWeek = TimetableCore.currentWeek(now, config);
    renderWeekChange();
  });
  $("closeDialog").addEventListener("click", closeCourse);
  $("closeConflictGroup").addEventListener("click",()=>{void closeDialog($("conflictGroupDialog"))});
  $("editCourse").addEventListener("click",openCourseEditor);
  $("editOccurrence").addEventListener("click",()=>openOccurrenceEditor(false));
  $("cancelOccurrence").addEventListener("click",()=>openOccurrenceEditor(true));
  $("cancelOccurrenceEdit").addEventListener("click",()=>{$("occurrenceEditForm").hidden=true;$("courseDetailView").hidden=false;reveal($("courseDetailView"));$("editOccurrence").focus()});
  $("occurrenceEditForm").addEventListener("submit",async event=>{
    event.preventDefault();if(editingBusy||!selectedCourseId||!selectedOccurrenceId)return;
    editingBusy=true;$("saveOccurrenceEdit").disabled=true;$("occurrenceEditError").hidden=true;
    try{const draft=occurrenceDraft();await AnyClassTimetableRepository.saveOccurrenceOverride(selectedOccurrenceId,selectedCourseId,draft);const cancelled=draft.cancelled;await refreshTimetableData();AnyClassShell.dispatchTimetableUpdated({reason:"occurrence-override"});$("occurrenceEditForm").hidden=true;$("courseDetailView").hidden=false;if(cancelled)await closeDialog($("courseDialog"));else{renderCourseDetail();reveal($("courseDetailView"))}}
    catch(error){const code=String(error?.message||"");$("occurrenceEditError").textContent=code.includes("DATE")?"请选择有效日期。":code.includes("PERIOD")?"请选择有效的开始和结束节次。":code.includes("GROUP")?"合并节次请先取消合并。":code.includes("TITLE")?"课程名称不能为空。":"保存失败，原课程未被修改。";$("occurrenceEditError").hidden=false}
    finally{editingBusy=false;$("saveOccurrenceEdit").disabled=false}
  });
  $("groupCourse").addEventListener("click",openGroupCourse);
  $("groupCandidateList").addEventListener("change",updateGroupPreview);
  $("closeGroupCourse").addEventListener("click",()=>{void closeDialog($("groupCourseDialog"))});
  $("cancelGroupCourse").addEventListener("click",()=>{void closeDialog($("groupCourseDialog"))});
  $("saveGroupCourse").addEventListener("click",async()=>{
    if(editingBusy || $("saveGroupCourse").disabled)return;
    editingBusy=true;$("saveGroupCourse").disabled=true;$("groupCourseError").hidden=true;
    try{
      const ids=[...$("groupCandidateList").querySelectorAll("input:checked")].map(input=>input.value);
      await AnyClassTimetableRepository.createSessionGroup(ids);
      await closeDialog($("groupCourseDialog"));await closeDialog($("courseDialog"));
      await refreshTimetableData();AnyClassShell.dispatchTimetableUpdated({reason:"session-group-create"});
    }catch(error){$("groupCourseError").textContent=error.message.includes("DISPLAY")?"课程信息不一致，请先核对。":error.message.includes("PERIOD")?"节次不连续，请重新选择。":"合并失败，原课程未被修改。";$("groupCourseError").hidden=false;updateGroupPreview()}
    finally{editingBusy=false}
  });
  $("ungroupCourse").addEventListener("click",async()=>{
    if(editingBusy)return;editingBusy=true;$("ungroupCourse").disabled=true;
    try{await AnyClassTimetableRepository.removeSessionGroup($("ungroupCourse").dataset.groupingId);await closeDialog($("courseDialog"));await refreshTimetableData();AnyClassShell.dispatchTimetableUpdated({reason:"session-group-remove"})}
    catch(_error){$("refreshNotice").textContent="取消合并失败，当前显示未修改。";$("refreshNotice").hidden=false}
    finally{editingBusy=false;$("ungroupCourse").disabled=false}
  });
  $("cancelCourseEdit").addEventListener("click",()=>{$("courseEditForm").hidden=true;$("courseDetailView").hidden=false;reveal($("courseDetailView"));$("editCourse").focus()});
  $("courseEditForm").addEventListener("submit",async event=>{
    event.preventDefault();
    if (editingBusy || !selectedCourseId) return;
    editingBusy=true;
    $("saveCourseEdit").disabled=true;
    const error=$('courseEditError');
    error.hidden=true;
    try {
      const manual = courseContext()?.course.sourceType === "manual";
      if (manual) await AnyClassTimetableRepository.updateManualCourse(selectedCourseId,readCourseDraft());
      else await AnyClassTimetableRepository.saveCourseOverride(selectedCourseId,readCourseDraft());
      await refreshTimetableData();
      $("courseEditForm").hidden=true;
      $("courseDetailView").hidden=false;
      renderCourseDetail();
      reveal($("courseDetailView"));
      AnyClassShell.dispatchTimetableUpdated({reason:manual ? "manual-course-edit" : "course-override"});
      $("editCourse").focus();
    } catch (failure) {
      const code=String(failure?.message || "");
      error.textContent = code.includes("TITLE") ? "课程名称不能为空。" : code.includes("WEEK") ? "请至少选择一个有效周次。" : code.includes("PERIOD") ? "请选择有效的开始和结束节次。" : code.includes("ORPHANED_OCCURRENCE") ? "该课程已有单次调整，当前周次修改会使其失效，未保存。" : "保存失败，课程未被修改。";
      error.hidden=false;
    } finally {editingBusy=false;$("saveCourseEdit").disabled=false}
  });
  $("addCourse").addEventListener("click",openCreateCourse);
  $("addCourseEmpty").addEventListener("click",openCreateCourse);
  $("createCourseDialog").addEventListener("close",()=>{pendingCreate=null;$("createConflictReview").hidden=true;$("createCourseForm").hidden=false});
  $("closeCreateCourse").addEventListener("click",()=>{void closeDialog($("createCourseDialog"))});
  $("cancelCreateCourse").addEventListener("click",()=>{void closeDialog($("createCourseDialog"))});
  $("cancelConflictCreate").addEventListener("click",()=>{void closeDialog($("createCourseDialog"))});
  $("reviseConflictCreate").addEventListener("click",()=>{pendingCreate=null;$("createConflictReview").hidden=true;$("createCourseForm").hidden=false;reveal($("createCourseForm"));$("create-title").focus()});
  const attachButton=el("button","button primary","添加上课时间到已有课程");attachButton.id="attachConflictCreate";attachButton.type="button";attachButton.hidden=true;$("confirmConflictCreate").before(attachButton);
  attachButton.addEventListener("click",()=>commitCreate(pendingCreate,$("createConflictError")));
  $("confirmConflictCreate").addEventListener("click",()=>commitCreate(pendingCreate,$("createConflictError")));
  $("manualTotalWeeks").addEventListener("input",()=>{if(!createTerm&&/^\d+$/.test($("manualTotalWeeks").value)&&Number($("manualTotalWeeks").value)>=1&&Number($("manualTotalWeeks").value)<=52)renderCreateForm()});
  $("createCourseForm").addEventListener("submit",async event=>{
    event.preventDefault();if(editingBusy||!createTable)return;
    editingBusy=true;$("saveCreateCourse").disabled=true;$("createCourseError").hidden=true;
    try{
      if(!createTerm&&!$("manualContextConfirm").checked)throw Error("MANUAL_CONTEXT_CONFIRM_REQUIRED");
      const context=createTerm?null:{semesterStartDate:$("manualStartDate").value,totalWeeks:Number($("manualTotalWeeks").value),periodTimes:manualScheduleEditor.read(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
      const draft=readCourseDraft($("createCourseForm"));
      const collisions=await createCollisions(draft,context);
      const sameName=resolvedCourses().filter(row=>AnyClassCourseModel.normalizeCourseName(row.title)===AnyClassCourseModel.normalizeCourseName(draft.title));
      const entry={timetableId:createTable.timetableId,draft,context};
      if(sameName.length)entry.draft={...draft,attachToCourseId:sameName[0].courseId};
      if(collisions.length||sameName.length){pendingCreate=entry;showCreateConflictReview(collisions,sameName)}
      else {editingBusy=false;await commitCreate(entry)}
    }catch(error){const code=String(error?.message||"");showCreateError(code.includes("TITLE")?"课程名称不能为空。":code.includes("WEEK")?"请选择有效周次和总周数。":code.includes("PERIOD")?"请选择有效节次。":code.includes("MONDAY")?"请选择第 1 周的星期一。":code.includes("CONFIRM")?"请确认当前节次时间。":"添加失败，课程未被保存。")}
    finally{editingBusy=false;$("saveCreateCourse").disabled=false}
  });
  $("deleteManualCourse").addEventListener("click",()=>{$("deleteCourseError").hidden=true;$("deleteCourseDialog").showModal();$("cancelDeleteCourse").focus()});
  $("cancelDeleteCourse").addEventListener("click",()=>{void closeDialog($("deleteCourseDialog"))});
  $("confirmDeleteCourse").addEventListener("click",async()=>{
    if(editingBusy||!selectedCourseId)return;editingBusy=true;$("confirmDeleteCourse").disabled=true;
    try{await AnyClassTimetableRepository.deleteManualCourse(selectedCourseId);await closeDialog($("deleteCourseDialog"));await closeDialog($("courseDialog"));selectedCourseId=null;await refreshTimetableData();AnyClassShell.dispatchTimetableUpdated({reason:"manual-course-delete"})}
    catch(_error){$("deleteCourseError").textContent="删除失败，课程未被修改。";$("deleteCourseError").hidden=false}
    finally{editingBusy=false;$("confirmDeleteCourse").disabled=false}
  });
  $("courseDialog").addEventListener("cancel", event => {
    event.preventDefault();
    closeCourse();
  });
  $("courseDialog").addEventListener("click", event => {
    if (event.target === $("courseDialog") || event.target.matches?.("[data-course-dialog-scrim]")) closeCourse();
  });

  const refreshTimetableData = async (options = {}) => {
    const run = ++refreshRevision;
    const switching = options.reason === "active-timetable";
    if (switching) {
      dataset = null;
      if (minuteTimer) { clearInterval(minuteTimer); minuteTimer = null; }
      $("app").hidden = true;
    }
    const initial = !dataset;
    const previousWeek = selectedWeek;
    const scrollY = window.scrollY;
    const gridScroll = document.querySelector(".grid-scroll");
    const gridScrollLeft = gridScroll ? gridScroll.scrollLeft : 0;
    const button = $("refreshTimetable");
    if (button) { button.classList.add("is-refreshing"); button.setAttribute("aria-busy", "true"); }
    $("refreshNotice").hidden = true;
    if (initial) {
      $("loading").hidden = false;
      $("loading").textContent = "正在读取本机课表…";
      $("emptyState").hidden = true;
      $("storageError").hidden = true;
      $("app").hidden = true;
    }
    AnyClassShell.setStorageError(false);
    try {
      const [nextDataset, active] = await Promise.all([TimetableStorage.activeDataset(),AnyClassTimetableRepository.getActiveTimetable()]);
      if (run !== refreshRevision) return;
      if (nextDataset) { baseConfig = nextDataset.__runtimeProfile; config = baseConfig; }
      $("loading").hidden = true;
      if (nextDataset?.__courseModel && !Array.isArray(nextDataset.__effectiveOccurrences)) throw new Error("SCHEMA3_EFFECTIVE_OCCURRENCES_REQUIRED");
      if (!nextDataset || (!nextDataset.__courseModel && (!Array.isArray(nextDataset.meetings) || !nextDataset.meetings.length))) {
        dataset = null;
        const heading = document.querySelector("#emptyState [data-online-empty] h1");
        if (heading) heading.textContent = active ? `“${active.label}”暂无课程` : "还没有课程表";
        $("addCourseEmpty").hidden=!active;
        $("createTimetableEmpty").hidden=Boolean(active);
        AnyClassShell.setDataState(false);
        $("emptyState").hidden = false;
        $("app").hidden = true;
        if (switching) AnyClassMotion.reveal($("emptyState"));
        return;
      }
      dataset = nextDataset;
      AnyClassShell.setDataState(true);
      maxWeek = TimetableCore.maxDatasetWeek(dataset) || 1;
      selectedWeek = initial
        ? Math.max(1, Math.min(maxWeek, TimetableCore.currentWeek(new Date(), config)))
        : Math.max(1, Math.min(maxWeek, previousWeek));
      if(!initial && selectedOccurrenceId){const moved=dataset.__effectiveOccurrences.find(row=>row.occurrenceId===selectedOccurrenceId);if(moved){const targetWeek=TimetableCore.currentWeek(new Date(`${moved.effectiveDate}T12:00:00`),config);selectedWeek=Math.max(1,Math.min(maxWeek,targetWeek))}}
      $("emptyState").hidden = true;
      $("storageError").hidden = true;
      $("app").hidden = false;
      render();
      if (switching) AnyClassMotion.reveal($("app"));
      requestAnimationFrame(() => {
        if (run !== refreshRevision) return;
        window.scrollTo({top: scrollY, behavior: "auto"});
        if (gridScroll) gridScroll.scrollLeft = gridScrollLeft;
      });
      if (!minuteTimer) minuteTimer = setInterval(render, 60000);
    } catch (_error) {
      if (run !== refreshRevision) return;
      if (dataset) {
        $("refreshNotice").textContent = "更新失败，当前仍显示上一次数据";
        $("refreshNotice").hidden = false;
      } else {
        $("loading").hidden = true;
        $("storageError").hidden = false;
        AnyClassShell.setStorageError("无法读取本机课程数据。");
      }
    } finally {
      if (run === refreshRevision && button) { button.classList.remove("is-refreshing"); button.removeAttribute("aria-busy"); }
    }
  };

  window.refreshTimetableData = refreshTimetableData;
  $("retryStorage").addEventListener("click", refreshTimetableData);
  $("refreshTimetable")?.addEventListener("click", refreshTimetableData);
  addEventListener("anyclass:timetable-updated", event => refreshTimetableData(event.detail || {}));
  window.addEventListener("scroll", updateReturnNow, {passive: true});
  window.addEventListener("resize", () => {
    updateReturnNow();
    if (!dataset || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = null; render(); });
  }, {passive: true});
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshTimetableData();
  });
  addEventListener("storage", event => {
    if (event.key === AnyClassPeriodPreferences.KEY && dataset) render();
  });
  addEventListener("pageshow", () => { if (dataset) render(); });
  addEventListener("focus", () => { if (dataset) render(); });
  addEventListener("anyclass:period-preferences", () => { if (dataset) render(); });
  refreshTimetableData().then(async()=>{
    if(new URLSearchParams(location.search).get("action")!=="add-course")return;
    const active=await AnyClassTimetableRepository.getActiveTimetable();
    if(active)await openCreateCourse();
  });
})();
