(() => {
  "use strict";

  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  const input = $("fileInput");
  const message = $("fileMessage");
  const submitMessage = $("fileSubmitMessage");
  const preview = $("filePreview");
  const save = $("fileSave");
  let pending = null;
  let timeEditor = null;
  let detectedTimezone = null;
  let usingDefaultTimes = false;
  let importSource = "file";
  let storageFactory = indexedDB;
  let importTarget = null;
  let defaultTarget = null, matchingTarget = null, timetableNameEdited = false;
  let nameRevision=0,namePlan=null,nameSignature=null;
  const nameChoices=new Map();
  const NAME_STATES=Object.freeze({UNRESOLVED:"UNRESOLVED",MERGE_WITH_EXISTING:"MERGE_WITH_EXISTING",RENAME_PENDING:"RENAME_PENDING",RENAMED:"RENAMED",SKIP:"SKIP",KEEP_SEPARATE:"KEEP_SEPARATE"});
  const nameReviewStates=new Map();
  let renamedFeedback="";
  let timeReviewSignature=null;
  const conflictChoices=new Map();
  const exactDuplicateChoices=new Map();
  const CONFLICT_STATES=Object.freeze({UNRESOLVED:"UNRESOLVED",EDITED_REVALIDATING:"EDITED_REVALIDATING",RESOLVED_BY_EDIT:"RESOLVED_BY_EDIT",SKIPPED:"SKIPPED",CONFIRMED_REAL_CONFLICT:"CONFIRMED_REAL_CONFLICT"});
  let conflictPairs=[],exactDuplicatePairs=[],exactDuplicateSignature="[]",conflictReady=false,targetBundle=null,conflictFeedback="";
  let editOrigin=null,editReturnRevision=0,reviewHoldTimer=null;
  const returnMotion=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth";
  const holdReviewGeometry=()=>{
    if(reviewHoldTimer!==null)clearTimeout(reviewHoldTimer);
    const beforeY=window.scrollY;
    preview.style.minHeight=`${Math.ceil(preview.getBoundingClientRect().height)}px`;
    preview.style.overflowAnchor="none";
    return ()=>{
      window.scrollTo({top:beforeY,behavior:"instant"});
      reviewHoldTimer=setTimeout(()=>{preview.style.minHeight="";preview.style.overflowAnchor="";reviewHoldTimer=null},300);
    };
  };
  const navigateReview=async target=>{
    const revision=++editReturnRevision;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(revision!==editReturnRevision||!target?.isConnected||target.hidden)return;
    for(let details=target.closest("details:not([open])");details;details=target.closest("details:not([open])"))details.open=true;
    const offset=Math.min(180,Math.max(96,Math.round(innerHeight*.18)));
    const top=Math.max(0,window.scrollY+target.getBoundingClientRect().top-offset);
    if(!target.hasAttribute("tabindex"))target.setAttribute("tabindex","-1");
    target.focus({preventScroll:true});
    window.scrollTo({top,behavior:returnMotion()});
    target.classList.add("file-edit-return-target");
    setTimeout(()=>target.classList.remove("file-edit-return-target"),1200);
  };
  const captureConflictOrigin=card=>{
    const cards=[...$("fileConflictItems").querySelectorAll(".file-conflict-item")],index=cards.indexOf(card),unresolved=cards.filter(node=>node.dataset.reviewState!==CONFLICT_STATES.CONFIRMED_REAL_CONFLICT),groupKey=card.dataset.groupKey;
    const later=unresolved.filter(node=>cards.indexOf(node)>index),same=later.find(node=>node.dataset.groupKey===groupKey),nextGroup=later.find(node=>node.dataset.groupKey!==groupKey);
    return {kind:"time",conflictType:card.dataset.conflictType,pairIdentity:card.dataset.pairIdentity,groupKey,stableKey:card.dataset.stableKey,nextSameKey:same?.dataset.stableKey,nextGroupKey:nextGroup?.dataset.stableKey};
  };
  const nextReviewTarget=origin=>{
    const review=$("fileConflictReview"),status=$("fileEditReturnStatus");
    if(review.hidden){status.textContent="✓ 已跳过，时间重叠已解决。";status.hidden=false;return status}
    $("fileConflictDetails").open=true;
    const cards=[...$("fileConflictItems").querySelectorAll(".file-conflict-item")].filter(node=>node.dataset.reviewState!==CONFLICT_STATES.CONFIRMED_REAL_CONFLICT);
    const same=cards.filter(node=>node.dataset.groupKey===origin.groupKey);
    let target=same.find(node=>node.dataset.stableKey===origin.nextSameKey)||same[0];
    if(!target)target=cards.find(node=>node.dataset.stableKey===origin.nextGroupKey)||cards.find(node=>node.dataset.groupKey!==origin.groupKey);
    if(!target){status.textContent="✓ 已核对所有时间重叠，请完成最终确认。";status.hidden=false;return $("fileConflictConfirm").disabled?$("fileConflictProgress"):$("fileConflictConfirm")}
    target.closest(".file-conflict-group")?.setAttribute("open","");
    status.hidden=true;return target;
  };
  const returnToEditOrigin=(origin,applied=false)=>{
    if(!origin)return;
    const status=$("fileEditReturnStatus");
    let target=null,resolved=false;
    if(origin.kind==="name")target=[...$("fileNameItems").children].find(node=>node.dataset.groupKey===origin.groupKey);
    else if(origin.kind==="time"){
      const details=$("fileConflictDetails");
      if(!$("fileConflictReview").hidden){
        details.open=true;
        target=[...$("fileConflictItems").querySelectorAll(".file-conflict-item")].find(node=>node.dataset.pairIdentity===origin.pairIdentity);
        resolved=applied&&!target;
        const group=target?.closest(".file-conflict-group")||[...$("fileConflictItems").querySelectorAll(".file-conflict-group")].find(node=>node.dataset.groupKey===origin.groupKey);
        if(group)group.open=true;
        target=target||group||$("fileConflictProgress");
      }
    }else if(origin.kind==="time-summary"&&!$("fileConflictReview").hidden){$("fileConflictDetails").open=true;target=$("fileConflictProgress")}
    if(applied&&(resolved||!target||origin.kind==="name"&&$("fileNameReview").hidden||origin.kind==="time"&&$("fileConflictReview").hidden)){
      status.textContent="✓ 修改已应用，该项冲突已解决。";status.hidden=false;target=status;
    }else if(target){status.hidden=true;status.textContent=""}
    else target=$("filePreview");
    void navigateReview(target);
  };
  const rowSignature=row=>JSON.stringify([row.sourceCourseId||null,row.sourceTeachingClassId||null,row.courseName,row.teacher,row.locationRaw,row.weekday,row.startPeriod,row.endPeriod,row.weeks,row.isAdjusted]);
  const exactDuplicateKey=(row,existing)=>JSON.stringify([rowSignature(row),existing.courseId]);
  const conflictKey=(type,a,b,aIndex,bIndex)=>`${type}:${aIndex}:${bIndex??b.courseId}:${type==="INTERNAL"?[rowSignature(a),rowSignature(b)].sort().join("|"):`${rowSignature(a)}|${b.courseId}`}`;
  const unresolvedConflicts=()=>conflictPairs.filter(item=>conflictChoices.get(item.key)!==CONFLICT_STATES.CONFIRMED_REAL_CONFLICT);
  const timeSignature=dataset=>JSON.stringify(dataset.meetings.map(row=>[row.courseName,row.teacher,row.locationRaw,row.weekday,row.startPeriod,row.endPeriod,row.weeks]));
  const namedDataset=()=>AnyClassCourseNameReview.apply(pending,importTarget?.id||null,nameChoices,namePlan);
  const reviewedDataset=()=>{
    const resolved=namedDataset();
    const resolvedKeys=new Set(exactDuplicatePairs.filter(item=>exactDuplicateChoices.has(item.key)).map(item=>rowSignature(item.incoming)));
    return {...resolved,meetings:resolved.meetings.filter(row=>!resolvedKeys.has(rowSignature(row)))};
  };
  const nameReviewReady=()=>{try{return !!namePlan&&!!namedDataset()}catch(_){return false}};
  const unresolvedNames=()=>new Set((namePlan?.conflicts||[]).map(item=>item.incoming.key).filter(key=>!nameChoices.has(key)));
  const syncConflictConfirm=()=>{
    const checkbox=$("fileConflictConfirm"),help=$("fileConflictConfirmHelp");
    if($( "fileConflictReview").hidden){checkbox.disabled=true;help.textContent="";return}
    const remaining=unresolvedNames().size,unresolved=unresolvedConflicts().length;
    checkbox.disabled=remaining>0||unresolved>0||!$("fileConflictDetails").open;
    help.textContent=remaining?`还有 ${remaining} 项课程名称需要处理，完成后才能确认保存。`:unresolved?`还有 ${unresolved} 项时间重叠待处理。`:!$("fileConflictDetails").open?"请先展开并核对上方的时间重叠详情。":checkbox.checked?"已确认保留这些真实时间冲突。":"每项已明确保留；请最终确认后再保存。";
  };
  const STATES = Object.freeze({IDLE:"IDLE",PARSING:"PARSING",VALIDATION_REQUIRED:"VALIDATION_REQUIRED",PREVIEW_READY:"PREVIEW_READY",SAVING:"SAVING",REVIEW_REQUIRED:"REVIEW_REQUIRED",SAVE_FAILED:"SAVE_FAILED",SUCCESS:"SUCCESS",COMMITTED_UNVERIFIED:"COMMITTED_UNVERIFIED"});
  let state = STATES.IDLE;
  let redirectTimer = null;
  let countdownTimer = null;
  let navigating = false;
  const validMonday = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === value && date.getUTCDay() === 1;
  };
  const validTimezone = value => {try { if (!value) return false; new Intl.DateTimeFormat("en",{timeZone:value}); return true; } catch (_) { return false; }};
  const submitEligibility = () => {
    const reasons = [];
    const schoolName = $("fileSchoolName").value.trim(), timetableName = $("fileTimetableName").value.trim();
    if (![STATES.VALIDATION_REQUIRED,STATES.PREVIEW_READY,STATES.SAVE_FAILED].includes(state)) reasons.push(state===STATES.SAVING?"正在保存，请稍候。":"当前没有可提交的导入预览。");
    if (!pending) reasons.push("请先选择并预览课表。");
    if (!importTarget) reasons.push("请先确认导入目标。");
    else if (importTarget.blocked) reasons.push("当前导入目标不可直接覆盖，请明确选择可用课表。");
    if (!schoolName || schoolName.length > 300) reasons.push("请确认学校名称（最多 300 字）。");
    if (!timetableName || timetableName.length > 100) reasons.push("请确认课表名称（最多 100 字）。");
    if (!validMonday($("fileSemesterStart").value)) reasons.push("请选择学期第一周的星期一。");
    if (!validTimezone(detectedTimezone || $("fileTimezone").value.trim())) reasons.push("请确认有效的设备时区。");
    if (!conflictReady || nameSignature===null) reasons.push("课程检查尚未完成，请稍候。");
    else {
      const unresolved = unresolvedConflicts().length;
      if (unresolved) reasons.push(`还有 ${unresolved} 项时间重叠未处理。`);
      const unresolvedExact=exactDuplicatePairs.filter(item=>!exactDuplicateChoices.has(item.key)).length;
      if(unresolvedExact)reasons.push(`还有 ${unresolvedExact} 条已存在的课程安排需要处理。`);
      if (!nameReviewReady()) reasons.push("请完成课程名称处理。");
      if (!$("fileConflictReview").hidden && !$("fileConflictConfirm").checked) reasons.push("请核对并确认保留的时间冲突。");
    }
    if (document.body.classList.contains("reimport-review-active")) reasons.push("请完成下方的课表更新核对。");
    if (timeEditor && !$("fileTimeEditor").hidden) try { timeEditor.read(); } catch (_) { reasons.push("请检查上课时间设置。"); }
    return {canSubmit:reasons.length===0,reasons};
  };
  const clearRedirect = () => {
    if (redirectTimer !== null) clearTimeout(redirectTimer);
    if (countdownTimer !== null) clearInterval(countdownTimer);
    redirectTimer = countdownTimer = null;
  };
  const setState = next => {
    state = next;
    preview.dataset.importState = next;
    const editable = [STATES.VALIDATION_REQUIRED,STATES.PREVIEW_READY,STATES.SAVE_FAILED].includes(next);
    const eligibility = submitEligibility();
    save.hidden = !(editable || next === STATES.SAVING);
    save.disabled = !eligibility.canSubmit;
    save.setAttribute("aria-disabled",String(!eligibility.canSubmit));
    save.textContent = next === STATES.SAVING ? "正在保存…" : "确认并保存到本机";
    const blockers=$("fileSubmitBlockers");
    blockers.textContent=editable&&!eligibility.canSubmit?`保存前还需完成：${eligibility.reasons.join(" ")}`:"";
    blockers.hidden=!blockers.textContent;
    $("fileCancel").hidden = !editable;
    $("fileSaved").hidden = next !== STATES.SUCCESS;
    $("fileGoToday").hidden = next !== STATES.SUCCESS;
    input.disabled = next === STATES.SAVING || next === STATES.SUCCESS;
  };
  const goToday = () => {
    if (navigating || state !== STATES.SUCCESS) return;
    navigating = true;
    clearRedirect();
    location.assign("/today/");
  };
  setState(STATES.IDLE);
  const updateDateDisplay = () => {
    const value = $("fileSemesterStart").value;
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
    $("fileDateDisplay").textContent = hasDate ? value.replaceAll("-", "/") : "YYYY/MM/DD";
    $("fileDateDisplay").dataset.empty = String(!hasDate);
  };
  const updateTimingStatus = () => {
    let count = 0, invalid = false;
    if (timeEditor) try { count = Object.keys(timeEditor.read()).length; } catch (_) { invalid = true; }
    const highest = pending ? AnyClassScheduleTimes.maxPeriod(pending.meetings) : 0;
    const defaultStart = AnyClassDefaultPeriodTimes.clone()[1].start;
    $("filePeriodHint").textContent = invalid ? "上课时间：正在填写。请检查时间顺序。" : usingDefaultTimes ? highest > AnyClassDefaultPeriodTimes.highest ? `上课时间：默认作息 · 第1节 ${defaultStart} 开始\n目前覆盖前 ${AnyClassDefaultPeriodTimes.highest} 节；其余可在课表设置中补充。` : `上课时间：默认作息 · 第1节 ${defaultStart} 开始\n可在课表设置中修改。` : count === 0 ? "上课时间：未设置。可稍后在「课表设置」中补充。" : count >= highest ? "上课时间：已设置。" : "上课时间：已填写部分节次；其余可稍后补充。";
    $("fileTimeNow").textContent = count > 0 ? "修改" : "现在设置";
  };
  const updateImportTarget = () => {
    const name = $("fileTimetableName").value.trim() || "待填写";
    $("fileImportTarget").textContent = importTarget?.id
      ? `将导入到：“${importTarget.label}”${importTarget.blocked ? "。此课表已有其他来源的课程，暂不能直接覆盖。" : importTarget.semesterMismatch ? "。导入文件的学期与当前课表不同；仍以当前课表为目标，请核对学期信息后再保存。" : "。"}`
      : importTarget?.blocked ? "请先选择当前课表，再确认导入目标。" : importTarget ? `将创建新课表：“${name}”。` : "";
    const alternative = matchingTarget && defaultTarget?.id !== matchingTarget.id;
    $("fileImportMatch").hidden = !alternative;
    if (alternative) {
      $("fileImportMatchText").textContent = `检测到该文件可能来自已有课表：“${matchingTarget.label}”。不会自动改为更新它。`;
      $("fileChangeTarget").textContent = importTarget?.id === matchingTarget.id ? `改回${defaultTarget.label || "未选目标"}` : `改为更新${matchingTarget.label}`;
    }
  };
  const sourceKeyFor=(bundle,dataset)=>bundle?.model?.snapshots?.find(snapshot=>snapshot.school?.id===dataset.school.id&&snapshot.semester?.academicYear===dataset.semester.academicYear&&String(snapshot.semester?.term)===String(dataset.semester.term))?.sourceKey||dataset.key;
  const setMessage = (text, kind = "muted") => {
    message.textContent = text;
    message.className = kind;
    message.hidden = !text;
    if (window.AnyClassShell) {
      if (kind === "error") AnyClassShell.setImportError(text);
      else AnyClassShell.setImportError(false);
    }
  };

  const resetPreview = () => {
    nameRevision++;namePlan=null;nameSignature=null;nameChoices.clear();nameReviewStates.clear();renamedFeedback="";timeReviewSignature=null;conflictChoices.clear();exactDuplicateChoices.clear();conflictPairs=[];exactDuplicatePairs=[];exactDuplicateSignature="[]";conflictReady=false;targetBundle=null;conflictFeedback="";editOrigin=null;editReturnRevision++;$("fileEditReturnStatus").hidden=true;$("fileNameReview").hidden=true;$("fileExactDuplicateReview").hidden=true;$("filePendingEditor").hidden=true;
    clearRedirect();
    navigating = false;
    if (document.body.classList.contains("reimport-review-active")) AnyClassReimportReview.close();
    pending = null;
    importTarget = defaultTarget = matchingTarget = null;
    timetableNameEdited = false;
    updateImportTarget();
    preview.hidden = true;
    setSubmitMessage("");
    clearFieldErrors();
    document.body.classList.remove("file-preview-active");
    $("fileCalendarContext").hidden = true;
    $("fileTimeEditor").hidden = true;
    timeEditor = null;
    usingDefaultTimes = false;
    $("fileTimeNow").setAttribute("aria-expanded", "false");
    $("fileSemesterStart").value = "";
    $("fileSchoolName").value = "";
    $("fileTimetableName").value = "";
    updateDateDisplay();
    $("fileRows").replaceChildren();
    $("fileConflictReview").hidden = true;
    $("fileConflictItems").replaceChildren();
    $("fileConflictConfirm").checked = false;
    $("fileConflictConfirm").disabled = true;
    $("fileConflictConfirmHelp").textContent="";
    $("fileConflictProgress").textContent="";
    setState(STATES.IDLE);
  };

  const renderValidationWarnings = (dataset, conflicts) => {
    const duplicates = AnyClassTimetableFile.detectDuplicateMeetings(dataset.meetings);
    const removed = dataset.diagnostics?.exactDuplicateCount || 0;
    const warnings = [];
    if (removed) warnings.push(`发现 ${removed} 条完全重复的课程安排，预览和保存时已去重。`);
    if (duplicates.length) warnings.push(`发现 ${duplicates.length} 对同名、同教师且周次/节次重叠的疑似重复安排；请展开下方详情核对，或编辑待导入课程。`);
    if (conflicts.groupCount > 1) warnings.push(`导入内部有 ${conflicts.groupCount} 组课程时间冲突，可能是识别错误；请核对星期、节次和周次。真实冲突也可逐项确认保留。`);
    else if (conflicts.groupCount) warnings.push("导入内部有 1 组课程时间冲突，可能是识别错误；请核对星期、节次和周次，真实冲突可保留。");
    $("fileConflictWarning").hidden = !warnings.length;
    $("fileConflictWarning").textContent = warnings.join(" ");
  };

  const renderPreview = async dataset => {
    $("fileSchool").textContent = dataset.school.name || "待确认";
    $("fileSchoolName").value = dataset.school.name || "";
    const routeAdapter = dataset.diagnostics?.adapterId || "file";
    const route = dataset.school.id == null ? null : AnyClassSchema4Plan.academicRoutingKey(routeAdapter,dataset.school.id,dataset.semester.academicYear,dataset.semester.term);
    const [routeMatch,active,tables] = await Promise.all([route ? AnyClassTimetableRepository.findTimetableByRoutingKey(route,storageFactory) : null,AnyClassTimetableRepository.getActiveTimetable(storageFactory),AnyClassTimetableRepository.listTimetables(storageFactory)]);
    if (pending !== dataset) return;
    const bundles = await Promise.all(tables.filter(table=>table.activeTermId).map(table=>AnyClassTimetableRepository.readTimetableBundle(table.timetableId,storageFactory)));
    if (pending !== dataset) return;
    const sourceMatches = dataset.school.id == null ? [] : bundles.filter(bundle=>bundle?.term?.schoolProfileSnapshot?.adapterId==="file"&&bundle.term.schoolProfileSnapshot.schoolId===dataset.school.id&&bundle.term.academicYear===dataset.semester.academicYear&&String(bundle.term.termCode)===String(dataset.semester.term)).map(bundle=>bundle.table);
    const existing = sourceMatches.find(table=>table.timetableId===routeMatch?.timetableId) || sourceMatches.find(table=>table.timetableId!==active?.timetableId) || null;
    let blocked = false,semesterMismatch=false;
    if (active?.activeTermId) {
      const bundle = bundles.find(item=>item.table.timetableId===active.timetableId);
      blocked=dataset.school.id != null&&bundle?.term?.schoolProfileSnapshot?.schoolId!==dataset.school.id;
      semesterMismatch=bundle?.term?.academicYear !== dataset.semester.academicYear || String(bundle?.term?.termCode) !== String(dataset.semester.term);
    }
    defaultTarget = active ? {id:active.timetableId,label:active.label,blocked,semesterMismatch} : {id:null,label:null,blocked:tables.length>0};
    matchingTarget = existing ? {id:existing.timetableId,label:existing.label,blocked:false} : null;
    importTarget = defaultTarget;
    $("fileTimetableName").value = active?.label || dataset.timetableName || "课程表";
    updateImportTarget();
    $("fileSemester").textContent = `${dataset.semester.academicYear} 第${dataset.semester.term}学期`;
    $("fileMeetingCount").textContent = dataset.meetings.length;
    $("fileCourseCount").textContent = new Set(dataset.meetings.map(meeting => meeting.courseName)).size;
    targetBundle=active?.timetableId?bundles.find(item=>item.table.timetableId===active.timetableId)||null:null;
    updateMeetingUi(dataset);
    // JSON school IDs, including the public demo ID, do not establish a reliable date.
    // Both file and clipboard imports use the same explicit scheduling context.
    const needsContext = true;
    $("fileCalendarContext").hidden = !needsContext;
    if (needsContext) {
      $("fileSemesterStart").value = "";
      updateDateDisplay();
      detectedTimezone = null;
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (zone) { new Intl.DateTimeFormat("en",{timeZone:zone}); detectedTimezone = zone; }
      } catch (_) {}
      $("fileTimezoneFallback").hidden = Boolean(detectedTimezone);
      $("fileTimezoneInfo").textContent = detectedTimezone ? `时区：跟随设备（${detectedTimezone}）` : "无法检测设备时区，请在下方填写。";
      $("fileTimezone").value = "";
      $("fileTimeEditor").hidden = true;
      usingDefaultTimes = true;
      timeEditor = AnyClassScheduleTimes.editor($("fileTimeEditor"),Math.max(AnyClassDefaultPeriodTimes.highest,AnyClassScheduleTimes.maxPeriod(dataset.meetings)),AnyClassDefaultPeriodTimes.clone());
      updateTimingStatus();
    }
    const fragment = document.createDocumentFragment();
    for (const meeting of dataset.meetings.slice(0, 50)) {
      const row = document.createElement("tr");
      const values = [
        meeting.courseName,
        `周${meeting.weekday} / ${meeting.startPeriod}-${meeting.endPeriod}节`,
        meeting.locationRaw || "—"
      ];
      for (const [index, value] of values.entries()) {
        const cell = document.createElement("td");
        cell.className = ["file-course-name", "file-course-time", "file-course-location"][index];
        cell.textContent = value;
        row.appendChild(cell);
      }
      fragment.appendChild(row);
    }
    $("fileRows").replaceChildren(fragment);
    $("filePreviewLimit").hidden = dataset.meetings.length <= 50;
    preview.hidden = false;
    document.body.classList.add("file-preview-active");
    setState(STATES.VALIDATION_REQUIRED);
    void refreshNameReview();
    if (!dataset.school.name) showFieldError("fileSchoolName","fileSchoolNameError","请填写学校名称。");
    preview.scrollIntoView({block:"start",behavior:"instant"});
  };

  const previewDataset = async (dataset, source = "file", options = {}) => {
    resetPreview();
    setState(STATES.PARSING);
    try {
      storageFactory = options.factory || indexedDB;
      if (!dataset || !Array.isArray(dataset.meetings)) throw Error("INVALID_IMPORT_DATASET");
      dataset.fingerprint = dataset.fingerprint || await AnyClassTimetableFile.fingerprint(dataset);
      importSource = source;
      pending = dataset;
      await renderPreview(dataset);
      if (source === "file") setMessage("文件校验通过，请确认预览后保存。", "ok");
      else if (source === "bookmark") setMessage("书签课表已读取，请补充并核对信息后保存。", "ok");
      return dataset;
    } catch (error) {
      setState(STATES.IDLE);
      if (source === "file") setMessage(`文件校验失败：${error.message || "未知错误"}`, "error");
      throw error;
    }
  };
  const previewText = async (text, source = "file", options = {}) => {
    const dataset = AnyClassTimetableFile.parseText(text);
    return previewDataset(dataset,source,options);
  };
  window.AnyClassSharedJsonImport = Object.freeze({previewText,previewDataset});

  input.addEventListener("change", async () => {
    if (state === STATES.SAVING || state === STATES.SUCCESS) return;
    resetPreview();
    const file = input.files && input.files[0];
    if (!file) {
      setMessage("尚未选择文件");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      setMessage("请选择扩展名为 .json 的课表文件", "error");
      return;
    }
    if (!file.size) {
      setMessage("文件为空", "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage("文件超过 5 MB 限制", "error");
      return;
    }
    try {
      await previewText(await file.text());
    } catch (error) {
      // previewText already presents file validation feedback.
    }
  });

  const refreshValidation=()=>{syncConflictConfirm();if ([STATES.VALIDATION_REQUIRED,STATES.PREVIEW_READY,STATES.SAVE_FAILED].includes(state)) setState(submitEligibility().canSubmit ? STATES.PREVIEW_READY : STATES.VALIDATION_REQUIRED);};
  $("fileConflictDetails").addEventListener("toggle",refreshValidation);
  $("fileConflictConfirm").addEventListener("change",refreshValidation);
  const dateChanged=()=>{updateDateDisplay();clearFieldError("fileSemesterStart","fileSemesterStartError");if ($("fileSemesterStart").value && !validMonday($("fileSemesterStart").value)) {$("fileSemesterStartError").textContent="请选择星期一作为第一周开始日期。";$("fileSemesterStartError").hidden=false;$("fileSemesterStart").setAttribute("aria-invalid","true");}refreshValidation();};
  $("fileSemesterStart").addEventListener("input",dateChanged);
  $("fileSemesterStart").addEventListener("change",dateChanged);
  $("fileTimezone").addEventListener("input",()=>{clearFieldError("fileTimezone","fileTimezoneError");const zone=$("fileTimezone").value.trim();if (zone && !validTimezone(zone)) {$("fileTimezoneError").textContent="请输入有效的 IANA 时区。";$("fileTimezoneError").hidden=false;$("fileTimezone").setAttribute("aria-invalid","true");}refreshValidation();});
  for (const [field,errorId] of [["fileSchoolName","fileSchoolNameError"],["fileTimetableName","fileTimetableNameError"]]) {
    $(field).addEventListener("input",()=>{clearFieldError(field,errorId);if (field === "fileSchoolName") $("fileSchool").textContent = $(field).value.trim() || "待确认";if (field === "fileTimetableName") {timetableNameEdited=true;updateImportTarget();}refreshValidation();});
  }
  $("fileChangeTarget").addEventListener("click",()=>{
    if (!matchingTarget || !defaultTarget) return;
    importTarget = importTarget?.id === matchingTarget.id ? defaultTarget : matchingTarget;
    if (!timetableNameEdited) $("fileTimetableName").value = importTarget.label || pending?.timetableName || "课程表";
    updateImportTarget();nameChoices.clear();nameReviewStates.clear();renamedFeedback="";conflictReady=false;void refreshNameReview();refreshValidation();
  });
  $("fileTimeEditor").addEventListener("input",()=>{usingDefaultTimes=false;updateTimingStatus();clearFieldError("fileTimeNow","fileTimeError");refreshValidation();});
  $("fileTimeEditor").addEventListener("change",()=>{usingDefaultTimes=false;updateTimingStatus();clearFieldError("fileTimeNow","fileTimeError");refreshValidation();});
  $("fileTimeNow").addEventListener("click",()=>{ $("fileTimeEditor").hidden = false; $("fileTimeNow").setAttribute("aria-expanded", "true"); $("fileTimeEditor").querySelector("input")?.focus(); });
  const readCalendarContext = dataset => {
    try {
      const periodTimes = $("fileTimeEditor").hidden ? AnyClassDefaultPeriodTimes.clone() : timeEditor.read();
      const context = {semesterStartDate:$("fileSemesterStart").value,timezone:detectedTimezone || $("fileTimezone").value.trim(),periodTimes};
      return AnyClassTimetableFileStorage.validateCalendarContext(dataset,context);
    }
    catch (error) {
      const code = error.message;
      const failure = new Error(code === "FILE_SEMESTER_START_MONDAY_REQUIRED" ? "请选择学期第一周的星期一。" : code === "FILE_TIMEZONE_INVALID" ? "请选择有效的设备时区。" : "请检查已填写的上课时间。");
      failure.field = code === "FILE_SEMESTER_START_MONDAY_REQUIRED" ? "date" : code === "FILE_TIMEZONE_INVALID" ? "timezone" : "time";
      throw failure;
    }
  };
  const refreshNameReview = async () => {
    const revision=++nameRevision,dataset=pending,target=importTarget?.id||null;
    namePlan=null;nameSignature=null;conflictReady=false;$("fileNameReview").hidden=true;refreshValidation();
    if(!dataset)return;
    try{
      const bundle=target?await AnyClassTimetableRepository.readTimetableBundle(target,storageFactory):null;
      if(revision!==nameRevision||dataset!==pending||target!==(importTarget?.id||null))return;
      targetBundle=bundle;
      const sourceKey=sourceKeyFor(bundle,dataset);
       const exact=AnyClassTimetableFile.classifyExistingMeetings(dataset.meetings,bundle?.model?.courses||[],bundle?.model?.courseOverrides||[],sourceKey).exactDuplicates;
       const plan=AnyClassCourseNameReview.plan(dataset.meetings,bundle?.model?.courses||[],bundle?.model?.courseOverrides||[],sourceKey,exact);
      namePlan=plan;nameSignature=JSON.stringify([target,dataset.meetings,plan.conflicts.map(item=>[item.kind,item.incoming.key,item.other.key])]);
      const incomingKeys=new Set(plan.incoming.map(item=>item.key));
      for(const [key,choice] of nameChoices)if(!incomingKeys.has(key)||(choice.targetGroupKey&&!incomingKeys.has(choice.targetGroupKey))){nameChoices.delete(key);nameReviewStates.delete(key)}
      for(const conflict of plan.conflicts)if(nameReviewStates.get(conflict.incoming.key)===NAME_STATES.RENAMED)nameReviewStates.set(conflict.incoming.key,NAME_STATES.UNRESOLVED);
      const section=$("fileNameReview"),items=$("fileNameItems");items.replaceChildren();section.hidden=!plan.conflicts.length;
      $("fileNameSummary").textContent=plan.conflicts.length?`发现同名课程安排；同一课程的多条上课安排仍可保留。请逐项明确处理。${renamedFeedback}`:renamedFeedback;
      const refreshProgress=()=>{
        const keys=new Set(plan.conflicts.map(item=>item.incoming.key));
        const handled=[...keys].filter(key=>nameChoices.has(key)).length;
        $("fileNameProgress").textContent=keys.size?`已处理 ${handled} / ${keys.size} 项；还有 ${keys.size-handled} 项待处理。`:"";
        syncConflictConfirm();
      };
      for(const conflict of plan.conflicts){
        const card=document.createElement("article"),text=document.createElement("p"),actions=document.createElement("div"),feedback=document.createElement("p");
        card.className="file-conflict-item";card.dataset.groupKey=conflict.incoming.key;actions.className="actions";
        const sample=dataset.meetings[conflict.incoming.indices[0]],other=conflict.kind==="EXISTING"?conflict.other.courses[0]:dataset.meetings[conflict.other.indices[0]];
        text.textContent=`导入：${conflict.incoming.name} · ${conflict.incoming.indices.length} 条安排 · ${sample.teacher||"教师未提供"} · ${sample.locationRaw||"地点未提供"} · 周${sample.weekday}第${sample.startPeriod}–${sample.endPeriod}节 · 第${sample.weeks.join("、")}周；${conflict.kind==="EXISTING"?"已有":"另一导入"}：${other.title||other.courseName} · ${other.teacher||"教师未提供"} · ${other.location||other.locationRaw||"地点未提供"} · 周${other.weekday}第${other.startPeriod}–${other.endPeriod}节 · 第${(other.weeks||[]).join("、")}周。`;
        feedback.className="file-name-choice-feedback";feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
        const renderChoice=()=>{
          const state=nameReviewStates.get(conflict.incoming.key)||NAME_STATES.UNRESOLVED;
          card.dataset.resolution=state;
          feedback.textContent=state===NAME_STATES.MERGE_WITH_EXISTING?"✓ 已选择合并到已有课程。将保留已有课程身份，并把本次导入的有效上课安排加入该课程。":state===NAME_STATES.SKIP?"✓ 已跳过。本次导入不会写入该课程。":state===NAME_STATES.RENAME_PENDING?"正在编辑导入课程；应用修改后会重新校验。":"请选择处理方式；保存前可更改选择。";
          actions.querySelectorAll("button[data-resolution]").forEach(node=>node.setAttribute("aria-pressed",String(node.dataset.resolution===state)));
        };
        const action=(label,kind,extra={})=>{const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent=label;button.dataset.resolution=kind==="merge"?NAME_STATES.MERGE_WITH_EXISTING:kind==="skip"?NAME_STATES.SKIP:NAME_STATES.RENAME_PENDING;button.addEventListener("click",()=>{if(kind==="edit"){editOrigin={kind:"name",groupKey:conflict.incoming.key,previousState:nameReviewStates.get(conflict.incoming.key)||NAME_STATES.UNRESOLVED};nameReviewStates.set(conflict.incoming.key,NAME_STATES.RENAME_PENDING);renderChoice();openPendingEditor(conflict.incoming.key);return}nameChoices.set(conflict.incoming.key,{kind,...extra});nameReviewStates.set(conflict.incoming.key,button.dataset.resolution);renderChoice();refreshProgress();if(nameReviewReady())updateMeetingUi(namedDataset());refreshValidation()});actions.append(button)};
        const sameNameExisting=plan.existing.filter(row=>AnyClassCourseNameReview.normalize(row.name)===AnyClassCourseNameReview.normalize(conflict.incoming.name));
        if(conflict.kind==="INCOMING")action("合并为同一课程","merge",{targetGroupKey:conflict.other.key});
        else if(sameNameExisting.length===1)action("合并到已有课程","merge",{logicalCourseId:conflict.other.key});
        action("修改导入课程名称","edit");action("跳过该课程","skip");
        card.append(text,actions,feedback);items.append(card);renderChoice();
      }
      refreshProgress();
      if(nameReviewReady())updateMeetingUi(namedDataset());
      else updateMeetingUi(dataset);
    }catch(_){$("fileNameReview").hidden=false;$("fileNameSummary").textContent="无法核对课程名称，本次暂不能保存。";nameSignature=null}
    refreshValidation();
  };
  const openPendingEditor = key => {
    if(!pending)return;
    $("fileEditReturnStatus").hidden=true;
    const groups=AnyClassCourseNameReview.groups(pending.meetings),select=$("filePendingGroup");select.replaceChildren();
    for(const group of groups){const option=document.createElement("option");option.value=group.key;option.textContent=`${group.name} · ${group.indices.length} 条安排`;select.append(option)}
    select.value=key||groups[0]?.key||"";
    $("filePendingEditor").hidden=false;updatePendingMeetingOptions();
    void navigateReview($("filePendingEditor"));
  };
  const openMeetingEditor = index => {
    const row=pending?.meetings[index];
    if(!row)return;
    openPendingEditor(AnyClassCourseNameReview.groupKey(row));
    $("filePendingMeeting").value=String(index);
    updatePendingFields();
  };
  $("fileConflictEdit").addEventListener("click",()=>{editOrigin={kind:"time-summary"};openPendingEditor()});
  const skipPendingMeeting = async (index,origin,card) => {
    if(!pending||pending.meetings.length<2)return;
    card?.classList.add("file-conflict-exiting");
    if(card){const status=card.querySelector(".file-conflict-status");if(status)status.textContent="✓ 已跳过";for(const button of card.querySelectorAll("button"))button.disabled=true}
    if(card&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)await new Promise(resolve=>setTimeout(resolve,180));
    const stabilize=holdReviewGeometry();
    const remaining=pending.meetings.filter((_,rowIndex)=>rowIndex!==index);
    const parsed=AnyClassTimetableFile.validateAndNormalize({schemaVersion:1,school:pending.school,semester:pending.semester,timetableName:pending.timetableName,meetings:remaining});
    parsed.timetableName=pending.timetableName;parsed.fingerprint=await AnyClassTimetableFile.fingerprint(parsed);
    pending=parsed;nameChoices.clear();nameReviewStates.clear();nameSignature=null;
    conflictFeedback="✓ 已跳过一条待导入安排并重新检查。";
    updateMeetingUi(parsed);setState(STATES.VALIDATION_REQUIRED);stabilize();await refreshNameReview();
    void navigateReview(nextReviewTarget(origin));
  };
  const updatePendingMeetingOptions = () => {
    const group=AnyClassCourseNameReview.groups(pending?.meetings).find(item=>item.key===$("filePendingGroup").value),select=$("filePendingMeeting");select.replaceChildren();
    if(!group)return;
    for(const index of group.indices){const row=pending.meetings[index],option=document.createElement("option");option.value=String(index);option.textContent=`周${row.weekday}第${row.startPeriod}–${row.endPeriod}节 · ${row.weeks.join("、")}周`;select.append(option)}
    updatePendingFields();
  };
  const updatePendingFields = () => {
    const row=pending?.meetings[Number($("filePendingMeeting").value)];if(!row)return;
    $("filePendingName").value=row.courseName;$("filePendingTeacher").value=row.teacher||"";$("filePendingLocation").value=row.locationRaw||"";
    $("filePendingWeekday").value=row.weekday;$("filePendingStart").value=row.startPeriod;$("filePendingEnd").value=row.endPeriod;$("filePendingWeeks").value=row.weeks.join(",");
  };
  const updateMeetingUi = dataset => {
    $("fileMeetingCount").textContent=dataset.meetings.length;
    $("fileCourseCount").textContent=AnyClassCourseNameReview.groups(dataset.meetings).length;
    const conflicts=AnyClassTimetableFile.detectConflicts(dataset.meetings),items=$("fileConflictItems");items.replaceChildren();
    const sourceKey=targetBundle?sourceKeyFor(targetBundle,dataset):null;
    const interactions=AnyClassTimetableFile.classifyExistingMeetings(dataset.meetings,targetBundle?.model?.courses||[],targetBundle?.model?.courseOverrides||[],sourceKey);
    const existing=interactions.conflicts;
    exactDuplicatePairs=interactions.exactDuplicates.map(item=>({...item,incoming:dataset.meetings[item.incomingIndex],key:exactDuplicateKey(dataset.meetings[item.incomingIndex],item.existing)}));
    exactDuplicateSignature=JSON.stringify(exactDuplicatePairs.map(item=>item.key).sort());
    const activeExactKeys=new Set(exactDuplicatePairs.map(item=>item.key));for(const key of exactDuplicateChoices.keys())if(!activeExactKeys.has(key))exactDuplicateChoices.delete(key);
    const exactSection=$("fileExactDuplicateReview"),exactItems=$("fileExactDuplicateItems");exactItems.replaceChildren();exactSection.hidden=!exactDuplicatePairs.length;
    $("fileExactDuplicateSummary").textContent=exactDuplicatePairs.length?`发现 ${exactDuplicatePairs.length} 条与当前课表完全相同的安排。它们不是时间冲突，不会重复写入；请选择复用或跳过。`:"";
    for(const item of exactDuplicatePairs){
      const card=document.createElement("article"),text=document.createElement("p"),actions=document.createElement("div"),status=document.createElement("p");
      card.className="file-conflict-item";card.dataset.duplicateKey=item.key;actions.className="actions";status.className="file-conflict-status";status.setAttribute("role","status");
      text.textContent=`完全重复：${item.incoming.courseName} · 周${item.incoming.weekday}第 ${item.incoming.startPeriod}–${item.incoming.endPeriod} 节 · 第${item.incoming.weeks.join("、")}周 · ${item.incoming.teacher||"教师未提供"} · ${item.incoming.locationRaw||"地点未提供"}`;
      const choose=(label,kind)=>{const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent=label;button.addEventListener("click",()=>{exactDuplicateChoices.set(item.key,{kind,logicalCourseId:AnyClassCourseModel.logicalId(item.existing)});status.textContent=kind==="reuse"?"✓ 将复用已有课程，不重复写入该安排。":"✓ 已跳过已存在的安排。";card.dataset.reviewState="RESOLVED";refreshValidation();void refreshNameReview()});actions.append(button)};
      choose("复用已有课程","reuse");choose("跳过已存在安排","skip");status.textContent=exactDuplicateChoices.has(item.key)?(exactDuplicateChoices.get(item.key).kind==="reuse"?"✓ 将复用已有课程，不重复写入该安排。":"✓ 已跳过已存在的安排。 "):"待处理：请选择复用或跳过；也可取消本次导入。";
      card.append(text,actions,status);exactItems.append(card);
    }
    const pairs=[];
    for(const indices of conflicts.groups)for(let left=0;left<indices.length;left++)for(let right=left+1;right<indices.length;right++){
      const a=dataset.meetings[indices[left]],b=dataset.meetings[indices[right]];
      if(a.weekday!==b.weekday||a.startPeriod>b.endPeriod||b.startPeriod>a.endPeriod)continue;
      const weeks=a.weeks.filter(week=>b.weeks.includes(week));if(weeks.length)pairs.push({type:"INTERNAL",left:indices[left],right:indices[right],weeks,startPeriod:Math.max(a.startPeriod,b.startPeriod),endPeriod:Math.min(a.endPeriod,b.endPeriod),key:conflictKey("INTERNAL",a,b,indices[left],indices[right])});
    }
    for(const overlap of existing)pairs.push({type:"EXISTING",...overlap,key:conflictKey("EXISTING",dataset.meetings[overlap.incomingIndex],overlap.existing,overlap.incomingIndex)});
    conflictPairs=pairs;
    const activeKeys=new Set(pairs.map(item=>item.key));for(const key of conflictChoices.keys())if(!activeKeys.has(key))conflictChoices.delete(key);
    for(const [key,value] of conflictChoices)if(value===CONFLICT_STATES.EDITED_REVALIDATING)conflictChoices.set(key,CONFLICT_STATES.UNRESOLVED);
    const changed=timeReviewSignature!==timeSignature(dataset);timeReviewSignature=timeSignature(dataset);
    if(changed){$("fileConflictDetails").open=false;$("fileConflictConfirm").checked=false}
    renderValidationWarnings(dataset,conflicts);
    if(existing.length)$("fileConflictWarning").textContent+=` 导入安排与当前课表已有课程另有 ${existing.length} 处时间重叠，请分别核对。`;
    $("fileConflictWarning").hidden=!$("fileConflictWarning").textContent;
    $("fileConflictReview").hidden=!pairs.length;
    $("fileConflictDetails").querySelector("summary").textContent=`导入内部 ${conflicts.groupCount} 组 · 与已有课程 ${existing.length} 处 · 查看详情`;
    $("fileConflictReview").dataset.grouped=String(pairs.length>20);
    const describe=row=>`${row.title||row.courseName} · 周${row.weekday}第 ${row.startPeriod}–${row.endPeriod} 节 · 第${row.weeks.join("、")}周 · ${row.location||row.locationRaw||"地点未提供"}`;
    const action=(container,label,handler)=>{const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent=label;button.addEventListener("click",handler);container.append(button)};
    const grouped=pairs.length>20,groups=new Map();
    if(grouped)for(const pair of pairs){const row=dataset.meetings[pair.left??pair.incomingIndex],key=row.sourceCourseId||row.courseName;let group=groups.get(key);if(!group){const details=document.createElement("details"),summary=document.createElement("summary"),body=document.createElement("div");details.className="file-conflict-group";details.dataset.groupKey=key;summary.textContent=`${row.courseName} · 0 处重叠`;details.append(summary,body);items.append(details);group={summary,body,count:0,name:row.courseName};groups.set(key,group)}group.count++}
    for(const group of groups.values())group.summary.textContent=`${group.name} · ${group.count} 处重叠`;
    const pendingIndexFor=datasetIndex=>{const row=dataset.meetings[datasetIndex],signature=rowSignature(row),ordinal=dataset.meetings.slice(0,datasetIndex+1).filter(item=>rowSignature(item)===signature).length-1,exact=pending.meetings.map((item,index)=>rowSignature(item)===signature?index:-1).filter(index=>index>=0)[ordinal];if(exact!==undefined)return exact;const schedule=item=>JSON.stringify([item.sourceCourseId||null,item.teacher,item.locationRaw,item.weekday,item.startPeriod,item.endPeriod,item.weeks]);return pending.meetings.findIndex(item=>schedule(item)===schedule(row))};
    for(const pair of pairs){
      const card=document.createElement("article"),title=document.createElement("strong"),a=dataset.meetings[pair.left??pair.incomingIndex],b=pair.type==="INTERNAL"?dataset.meetings[pair.right]:pair.existing;
      const aIndex=pendingIndexFor(pair.left??pair.incomingIndex),bIndex=pair.type==="INTERNAL"?pendingIndexFor(pair.right):-1;
      const pairIdentity=pair.type==="INTERNAL"?`INTERNAL:${pair.left}:${pair.right}`:`EXISTING:${pair.incomingIndex}:${pair.existing.courseId}`;
      card.className="file-conflict-item";card.dataset.conflictType=pair.type;card.dataset.conflictKey=pair.key;card.dataset.pairIdentity=pairIdentity;card.dataset.stableKey=JSON.stringify([pair.type,rowSignature(a),pair.type==="INTERNAL"?rowSignature(b):b.courseId]);card.dataset.groupKey=a.sourceCourseId||a.courseName;card.dataset.reviewState=conflictChoices.get(pair.key)||CONFLICT_STATES.UNRESOLVED;
      title.textContent=pair.type==="INTERNAL"?"导入内部时间重叠":"导入安排与已有课程时间重叠";card.append(title);
      for(const [label,row] of [["导入 A",a],[pair.type==="INTERNAL"?"导入 B":"已有课程",b]]){const line=document.createElement("p");line.textContent=`${label}：${describe(row)}`;card.append(line)}
      const detail=document.createElement("p");detail.textContent=`重叠：第 ${pair.weeks.join("、")} 周，周${a.weekday}第 ${pair.startPeriod}–${pair.endPeriod} 节。`;card.append(detail);
      const buttons=document.createElement("div");buttons.className="actions";
      const edit=index=>{editOrigin={kind:"time",pairIdentity,groupKey:a.sourceCourseId||a.courseName,conflictType:pair.type};conflictChoices.set(pair.key,CONFLICT_STATES.EDITED_REVALIDATING);card.dataset.reviewState=CONFLICT_STATES.EDITED_REVALIDATING;status.textContent="正在编辑；应用后将重新校验。";openMeetingEditor(index);refreshValidation()};
      action(buttons,"编辑课程 A",()=>edit(aIndex));
      if(pair.type==="INTERNAL")action(buttons,"编辑课程 B",()=>edit(bIndex));
      if(pending.meetings.length>1)action(buttons,"跳过导入安排 A",()=>{void skipPendingMeeting(aIndex,captureConflictOrigin(card),card)});
      if(pair.type==="INTERNAL"&&pending.meetings.length>1)action(buttons,"跳过导入安排 B",()=>{void skipPendingMeeting(bIndex,captureConflictOrigin(card),card)});
      action(buttons,"确认这是真实冲突，保留两者",()=>{const origin=captureConflictOrigin(card);conflictChoices.set(pair.key,CONFLICT_STATES.CONFIRMED_REAL_CONFLICT);card.dataset.reviewState=CONFLICT_STATES.CONFIRMED_REAL_CONFLICT;status.textContent="✓ 已确认真实冲突，仍需核对其余项目。";syncConflictConfirm();refreshValidation();void navigateReview(nextReviewTarget(origin))});
      card.append(buttons);const status=document.createElement("p");status.className="file-conflict-status";status.setAttribute("role","status");status.textContent=card.dataset.reviewState===CONFLICT_STATES.CONFIRMED_REAL_CONFLICT?"✓ 已确认保留真实冲突":"待处理：请编辑、跳过或明确保留";card.append(status);(grouped?groups.get(a.sourceCourseId||a.courseName).body:items).append(card);
    }
    $("fileConflictProgress").textContent=`导入内部 ${pairs.filter(item=>item.type==="INTERNAL").length} 项；与已有课程 ${existing.length} 项；待处理 ${unresolvedConflicts().length} 项。${conflictFeedback}`;
    conflictReady=true;syncConflictConfirm();
    const rows=document.createDocumentFragment();
    for(const meeting of dataset.meetings.slice(0,50)){
      const tr=document.createElement("tr");for(const [index,text] of [meeting.courseName,`周${meeting.weekday} / ${meeting.startPeriod}-${meeting.endPeriod}节`,meeting.locationRaw||"—"].entries()){const cell=document.createElement("td");cell.className=["file-course-name","file-course-time","file-course-location"][index];cell.textContent=text;tr.append(cell)}rows.append(tr)
    }
    $("fileRows").replaceChildren(rows);$("filePreviewLimit").hidden=dataset.meetings.length<=50;
  };
  $("filePendingGroup").addEventListener("change",updatePendingMeetingOptions);
  $("filePendingMeeting").addEventListener("change",updatePendingFields);
  $("filePendingCancel").addEventListener("click",async()=>{const origin=editOrigin;editOrigin=null;$("filePendingEditor").hidden=true;if(origin?.kind==="name")nameReviewStates.set(origin.groupKey,origin.previousState);for(const [key,value] of conflictChoices)if(value===CONFLICT_STATES.EDITED_REVALIDATING)conflictChoices.set(key,CONFLICT_STATES.UNRESOLVED);if(origin?.kind==="name")await refreshNameReview();else updateMeetingUi(nameReviewReady()?namedDataset():pending);refreshValidation();returnToEditOrigin(origin)});
  $("filePendingApply").addEventListener("click",async()=>{
    if(!pending)return;
    const error=$("filePendingError");error.hidden=true;
    try{
      const group=AnyClassCourseNameReview.groups(pending.meetings).find(row=>row.key===$("filePendingGroup").value),index=Number($("filePendingMeeting").value);
      if(!group||!group.indices.includes(index))throw Error("INVALID_PENDING_MEETING");
      const name=$("filePendingName").value.trim(),weeks=$("filePendingWeeks").value.split(/[,，、\s]+/u).filter(Boolean).map(Number);
      const meetings=pending.meetings.map((row,rowIndex)=>({...row,...(group.indices.includes(rowIndex)?{courseName:name}:{}),...(rowIndex===index?{teacher:$("filePendingTeacher").value.trim()||null,locationRaw:$("filePendingLocation").value.trim()||null,weekday:Number($("filePendingWeekday").value),startPeriod:Number($("filePendingStart").value),endPeriod:Number($("filePendingEnd").value),weeks}:{} )}));
      const parsed=AnyClassTimetableFile.validateAndNormalize({schemaVersion:1,school:pending.school,semester:pending.semester,timetableName:pending.timetableName,meetings});
      parsed.timetableName=pending.timetableName;parsed.fingerprint=await AnyClassTimetableFile.fingerprint(parsed);
      const origin=editOrigin;editOrigin=null;
      pending=parsed;nameChoices.delete(group.key);if(origin?.kind==="name")nameReviewStates.set(group.key,NAME_STATES.RENAMED);else if(nameReviewStates.get(group.key)===NAME_STATES.RENAME_PENDING)nameReviewStates.delete(group.key);nameSignature=null;
      renamedFeedback=" ✓ 已修改并重新校验；如仍出现同名安排，请继续处理。";
      const beforeConflicts=conflictPairs.length;
      updateMeetingUi(parsed);conflictFeedback=conflictPairs.length<beforeConflicts?`✓ 已解决 ${beforeConflicts-conflictPairs.length} 项时间重叠。`:"已修改并重新校验；仍有时间重叠需要处理。";$("fileConflictProgress").textContent=`导入内部 ${conflictPairs.filter(item=>item.type==="INTERNAL").length} 项；与已有课程 ${conflictPairs.filter(item=>item.type==="EXISTING").length} 项；待处理 ${unresolvedConflicts().length} 项。${conflictFeedback}`;$("filePendingEditor").hidden=true;setState(STATES.VALIDATION_REQUIRED);
      await refreshNameReview();setSubmitMessage("✓ 已修改并重新校验；请重新核对时间重叠及课程名称后保存。","muted",false);returnToEditOrigin(origin,true);
    }catch(failure){error.textContent=`修改未应用：${failure.message||"请核对课程与周次。"}`;error.hidden=false}
  });

  const setSubmitMessage = (text, kind = "muted", scroll = true) => {
    submitMessage.textContent = text;
    submitMessage.className = `file-submit-message ${kind}`;
    submitMessage.hidden = !text;
    if (text && scroll) submitMessage.scrollIntoView({block:"nearest",behavior:"instant"});
  };
  const committedButUnverified = text => {
    clearRedirect();
    setState(STATES.COMMITTED_UNVERIFIED);
    setSubmitMessage(text,"error");
  };
  const showSuccess = (dataset, result) => {
    pending = null;
    input.value = "";
    setMessage("");
    $("fileRows").replaceChildren();
    $("fileCalendarContext").hidden = true;
    timeEditor = null;
    document.body.classList.remove("file-preview-active");
    setState(STATES.SUCCESS);
    const merge = result?.mergeResult;
    const headline = `已保存到此设备：${dataset.meetings.length} 个课程安排。`;
    const detail = merge?.status === "NO_CHANGE" ? "课表没有变化，现有数据已保留。" : merge ? `课表已更新：更新课程 ${merge.sourceUpdatedCourses} 门，新增课程 ${merge.newCourses} 门。你的其他修改已保留。` : "";
    let remaining = 3;
    const update = () => setSubmitMessage(`${headline}${detail ? `\n${detail}` : ""}\n${remaining} 秒后自动前往 Today。`,"ok");
    update();
    countdownTimer = setInterval(() => { remaining -= 1; if (remaining > 0) update(); },1000);
    redirectTimer = setTimeout(goToday,3000);
  };
  const showExactDuplicateNoChange=async dataset=>{
    const targetId=importTarget?.id||null;
    if(targetId)await AnyClassTimetableRepository.setActiveTimetable(targetId);
    pending=null;input.value="";setMessage("");document.body.classList.remove("file-preview-active");setState(STATES.SUCCESS);
    let remaining=3;const update=()=>setSubmitMessage(`没有新的课程安排；完全重复项未再次写入，当前课表保持不变。\n${remaining} 秒后自动前往 Today。`,"ok");update();
    countdownTimer=setInterval(()=>{remaining-=1;if(remaining>0)update()},1000);redirectTimer=setTimeout(goToday,3000);
  };
  const clearFieldErrors = () => {
    for (const [field,error] of [["fileSchoolName","fileSchoolNameError"],["fileTimetableName","fileTimetableNameError"],["fileSemesterStart","fileSemesterStartError"],["fileTimezone","fileTimezoneError"],["fileTimeNow","fileTimeError"]]) clearFieldError(field,error);
  };
  function clearFieldError(field,error) {
    $(error).textContent = "";
    $(error).hidden = true;
    $(field).removeAttribute("aria-invalid");
  }
  const showFieldError = (field,errorId,text) => {
    $(errorId).textContent = text;
    $(errorId).hidden = false;
    $(field).setAttribute("aria-invalid","true");
    if (field === "fileTimeNow") {
      $("fileTimeEditor").hidden = false;
      $("fileTimeNow").setAttribute("aria-expanded","true");
      $("fileTimeEditor").querySelector("input")?.focus();
    } else $(field).focus();
    $(field).scrollIntoView({block:"center",behavior:"instant"});
  };

  save.addEventListener("click", async () => {
    const eligibility=submitEligibility();
    if (!eligibility.canSubmit) {setState(state);setSubmitMessage(`暂不能保存：${eligibility.reasons.join(" ")}`,"error");return;}
    setState(STATES.SAVING);
    setSubmitMessage("");
    clearFieldErrors();
    if (window.AnyClassShell) AnyClassShell.setStorageError(false);
    try {
      const calendarContext = $("fileCalendarContext").hidden ? undefined : readCalendarContext(pending);
      const schoolName = $("fileSchoolName").value.trim();
      const timetableName = $("fileTimetableName").value.trim();
      if (!schoolName || schoolName.length > 300) { const error = new Error("请填写学校名称。"); error.field = "school"; throw error; }
      if (!timetableName || timetableName.length > 100) { const error = new Error("请填写课表名称。"); error.field = "name"; throw error; }
      const chosenTargetId = importTarget?.id || null;
      const reviewedNameRevision=nameRevision;
      const freshBundle=chosenTargetId?await AnyClassTimetableRepository.readTimetableBundle(chosenTargetId,storageFactory):null;
      const freshSourceKey=sourceKeyFor(freshBundle,pending);
      const freshInteractions=AnyClassTimetableFile.classifyExistingMeetings(pending.meetings,freshBundle?.model?.courses||[],freshBundle?.model?.courseOverrides||[],freshSourceKey);
      const freshExactSignature=JSON.stringify(freshInteractions.exactDuplicates.map(item=>exactDuplicateKey(pending.meetings[item.incomingIndex],item.existing)).sort());
      const freshNamePlan=AnyClassCourseNameReview.plan(pending.meetings,freshBundle?.model?.courses||[],freshBundle?.model?.courseOverrides||[],freshSourceKey,freshInteractions.exactDuplicates);
      const freshNameSignature=JSON.stringify([chosenTargetId,pending.meetings,freshNamePlan.conflicts.map(item=>[item.kind,item.incoming.key,item.other.key])]);
      if(reviewedNameRevision!==nameRevision||freshNameSignature!==nameSignature||freshExactSignature!==exactDuplicateSignature){setState(STATES.PREVIEW_READY);exactDuplicateChoices.clear();targetBundle=freshBundle;updateMeetingUi(pending);void refreshNameReview();setSubmitMessage("课程名称、重复项或导入目标已变化，请重新核对。","error");return}
      const named=AnyClassCourseNameReview.apply(pending,chosenTargetId,nameChoices,freshNamePlan);
      const resolvedKeys=new Set(freshInteractions.exactDuplicates.map(item=>exactDuplicateKey(pending.meetings[item.incomingIndex],item.existing)).filter(key=>exactDuplicateChoices.has(key)));
      const resolved={...named,meetings:named.meetings.filter(row=>!freshInteractions.exactDuplicates.some(item=>resolvedKeys.has(exactDuplicateKey(pending.meetings[item.incomingIndex],item.existing))&&rowSignature(row)===rowSignature(pending.meetings[item.incomingIndex])))};
      if(!resolved.meetings.length){await showExactDuplicateNoChange(pending);return}
      const freshOverlaps=AnyClassTimetableFile.detectExistingConflicts(resolved.meetings,freshBundle?.model?.courses||[],freshBundle?.model?.courseOverrides||[],freshSourceKey).map(item=>conflictKey("EXISTING",resolved.meetings[item.incomingIndex],item.existing,item.incomingIndex)).sort();
      const reviewedOverlaps=conflictPairs.filter(item=>item.type==="EXISTING").map(item=>item.key).sort();
      if(JSON.stringify(freshOverlaps)!==JSON.stringify(reviewedOverlaps)){targetBundle=freshBundle;conflictChoices.clear();updateMeetingUi(resolved);setState(STATES.VALIDATION_REQUIRED);setSubmitMessage("当前课表的课程时间已变化，请重新核对导入与已有课程的重叠。","error");return}
      const dataset = {...resolved,school:{...resolved.school,name:schoolName},timetableName,...(calendarContext ? {calendarContext} : {}),importedAt: new Date().toISOString()};
      dataset.fingerprint=await AnyClassTimetableFile.fingerprint(dataset);
      await AnyClassReimportReview.start({
        sourceLabel:importSource === "clipboard" ? "剪贴板导入" : importSource === "bookmark" ? "书签导入" : "导入文件",
        commit: hooks => AnyClassTimetableFileStorage.putDataset(dataset,storageFactory,{...hooks,...(chosenTargetId ? {targetTimetableId:chosenTargetId} : {})}),
        onSuccess: async result => {
          try {
            const storedKey = result?.graph?.term?.importMetadata?.legacyKey || dataset.key;
            const stored = await AnyClassTimetableFileStorage.getDataset(storedKey);
            const keyCount = await AnyClassTimetableFileStorage.countKey(storedKey);
            if (!stored || stored.fingerprint !== dataset.fingerprint || stored.school?.name !== dataset.school.name || keyCount !== 1) throw Error("COMMITTED_READBACK_FAILED");
          } catch (_) { committedButUnverified("保存已提交，但读取校验未通过，请不要重复导入，先检查本机课表。"); return; }
          const timetableId = result?.graph?.timetable?.timetableId;
          if (!timetableId) { committedButUnverified("保存已提交，但无法确认课表归属，请不要重复导入，先检查本机课表。"); return; }
          try {
            await AnyClassTimetableRepository.setActiveTimetable(timetableId);
            const active = await AnyClassTimetableRepository.getActiveTimetable(storageFactory);
            if (active?.timetableId !== timetableId || active.schoolName !== dataset.school.name || active.label !== dataset.timetableName) throw Error("ACTIVE_TIMETABLE_READBACK_FAILED");
          } catch (_) { committedButUnverified("保存已提交，但未能确认当前课表，请不要重复导入，先检查本机课表。"); return; }
          AnyClassShell.dispatchTimetableUpdated({source:importSource});
          showSuccess(dataset,result);
        },
        onCancel:()=>{setState(STATES.PREVIEW_READY);setSubmitMessage("已取消本次更新，原有课表未改变。");},
        onFailure:()=>{setState(STATES.SAVE_FAILED);setSubmitMessage("保存失败，原有课表未被修改。","error");}
      });
    } catch (error) {
      setState(error.field ? STATES.VALIDATION_REQUIRED : STATES.SAVE_FAILED);
      if (error.field === "school") showFieldError("fileSchoolName","fileSchoolNameError",error.message);
      else if (error.field === "name") showFieldError("fileTimetableName","fileTimetableNameError",error.message);
      else if (error.field === "date") showFieldError("fileSemesterStart","fileSemesterStartError",error.message);
      else if (error.field === "timezone") showFieldError("fileTimezone","fileTimezoneError",error.message);
      else if (error.field === "time") showFieldError("fileTimeNow","fileTimeError",error.message);
      else setSubmitMessage("保存失败，原有课表未被修改。", "error");
      if (!error.field && window.AnyClassShell) AnyClassShell.setImportError(false);
    } finally {
      if (state === STATES.SAVING) setState(document.body.classList.contains("reimport-review-active") ? STATES.REVIEW_REQUIRED : STATES.SAVE_FAILED);
    }
  });

  $("fileCancel").addEventListener("click", () => {
    if (![STATES.VALIDATION_REQUIRED,STATES.PREVIEW_READY,STATES.SAVE_FAILED].includes(state)) return;
    const cancelledSource = importSource;
    resetPreview();
    input.value = "";
    if (importSource === "file") setMessage("已取消，本次文件未保存。", "muted");
    else if (cancelledSource === "clipboard") $("clipboardMessage").textContent = "已取消，本次内容未保存。";
    else if (cancelledSource === "bookmark") dispatchEvent(new CustomEvent("anyclass:bookmark-preview-reset"));
  });
  $("fileGoToday").addEventListener("click",goToday);
  addEventListener("pagehide",clearRedirect);
  document.addEventListener("visibilitychange",()=>{if (document.visibilityState === "hidden") clearRedirect();});
  document.addEventListener("click",event=>{if (state === STATES.SUCCESS && event.target.closest("a[href]")) clearRedirect();},true);
})();
