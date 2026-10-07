(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const text = $("clipboardText"), status = $("clipboardMessage"), prompt = $("clipboardPrompt");
  const PROMPT_VERSION = "anyclass-json-prompt-v5-cell-evidence-locked";
  const PROMPT = `AnyClass JSON 提示词版本：${PROMPT_VERSION}
你只负责把我提供的课程表截图或 PDF 转成 AnyClass Course Schema 的 JSON。不要创建日历事件，不要添加图片中没有的课程、教师、地点、周次或节次。下方样例仅说明格式，绝不能复制样例的学校、学年或课程作为真实结果。
目标结构（尖括号是必须由来源或用户确认的占位说明，绝不可原样输出或当作默认值）：{"schemaVersion":1,"school":{"id":null,"name":null},"semester":{"academicYear":"<已确认的YYYY-YYYY>","term":"<已确认的1或2>"},"meetings":[{"courseName":"<来源课程名>","weekday":1,"startPeriod":1,"endPeriod":2,"weeks":[1],"teacher":null,"locationRaw":null,"isAdjusted":false}]}
输出必须是一个 JSON 对象，schemaVersion 必须是数字 1；academicYear 为 YYYY-YYYY，term 为字符串 "1" 或 "2"；meetings 为非空数组。每条 meeting 必须有 courseName、weekday（周一=1 至周日=7）、startPeriod、endPeriod（整数且开始不晚于结束）、weeks（实际开课周次的升序整数数组）、teacher、locationRaw、isAdjusted（布尔值）。不要输出 Markdown、注释、解释或多余字段。不要编造学期第一周星期一的日期；AnyClass 会在导入预览中请用户填写。
必须先按表格几何结构解析，再读课程文字，严格按以下顺序：① 找到星期一至星期日的列标题及从左到右的物理位置；② 找到每个课程块实际所在的单元格/物理列；③ 只根据该列上方的星期标题赋值 weekday；④ 再读取该块内的 courseName、teacher、locationRaw、节次和周次；⑤ 将每条 meeting 的 weekday 与其物理列上方的标题逐一交叉核对。不要根据 OCR/PDF 文本提取顺序、阅读顺序、相邻课程出现先后推断或递增星期；课程名称、课次编号也不能决定星期。重复课程名称出现在多个列是有效的；同一逻辑课程的多个上课安排也有效。PDF 文本顺序绝不能覆盖视觉表格几何。以纵向行位置及块内节次文字核对 startPeriod/endPeriod，不要把第几周当成第几节；跨多个节次的课程写一个起止范围。
逐个可见的独立课程块提取一条 meeting，且只提取一次：同一块被 OCR 重复读出时不要再输出一条。不要仅按 courseName 合并；同名课程只要星期、节次、周次、教师或地点不同，就保留对应的独立 meeting。周次按原图的范围、单周/双周、跳周标注逐一展开，不能只取首周或把缺失周次补成连续周。实习、实验、体育等实践课程也照实际块与周次提取，不要省略。
教师只取明确标为教师/任课人的文字；教室、楼宇、校区及场地只放 locationRaw。若教师或地点没有显示，用 null；不要把教师姓名当成地点，或把教室编号当成教师。调课/补课块如有明确标记，isAdjusted=true；普通课为 false。不要因冲突、同名或看似异常而删除原图确有的课程。
示例（以下只是 meeting 片段，不是额外输出）：同名不同周次：{"courseName":"课程甲","weekday":1,"startPeriod":1,"endPeriod":2,"weeks":[1,3,5],"teacher":"教师甲","locationRaw":"A101","isAdjusted":false} 和同名同节次但 weeks 为 [2,4,6] 的另一条；同名不同地点：同一门实验课在周二第 3–4 节的第 1–4 周于实验室 A、第 5–8 周于实验室 B，分别写两条；多次上课：课程甲周一第 1–2 节与周四第 5–6 节分别写两条；实践课：按实际星期、节次和周次写一条，不因名称含“实习”而改成日历事件；明确标记的调课另写一条并设置 isAdjusted=true。
输出前在内部逐条自检：这个课程块在哪个物理星期列？该列上方是什么星期标题？输出的 weekday 是否与标题一致？再核对纵向节次、完整周次、教师/地点、调课标记；检查是否重复提取同一块。最后对整个课表检查：不相关的课程是否异常集中在同一个星期？内部时间重叠是否多得不合理？同一个视觉单元格是否被提取两次？有没有让 OCR/PDF 文本顺序盖过实际空间位置？按星期、节次、周次复核重叠安排，先重新检查每个冲突块的物理列，不能为消除冲突而擅自改动星期、删除真实课程或猜测位置；若是 OCR 重复则去掉重复行，若确为不同课程块或真实冲突则保留并让 AnyClass 预览核对。
V5 单元格证据锁定：先在内部做两遍处理。第一遍是不可展示的证据台账；每条 meeting 必须先锁定一个可识别的物理单元格或属于该格的连续课程块，逐项记录同一块中的物理星期列与列标题、可见课程原文、明确节次原文、周次原文、教师原文、地点原文。概念上隔离这个块；不要横向借用邻列文字、纵向借用邻行文字，或按 PDF/OCR 文本流拼装。第二遍才把逐项核实的证据转换为 JSON。每条 meeting 的 courseName、weekday、startPeriod、endPeriod、weeks、teacher、locationRaw 必须能指向同一个来源块；不能把 A 格课程名、B 格周次和 C 格教师拼成一条。
字段证据优先级：weekday 只能由课程块所在的物理列和上方星期标题决定。节次优先采用同一块内明确写出的“1-8节”“1-10节”等原文，只有没有明确节次文字时才使用纵向位置；明确的 1-8 必须输出 startPeriod=1、endPeriod=8，1-10 必须输出 1、10，不能按视觉行高擅自缩成 3-4、5-6 或拆成多条。一个来源安排如“(1-8节)12周”只是一条 1-8 节、第 12 周的 meeting；除非原表确有两个独立安排，不得拆分。反过来，同一课程第 11 周在 A 教室、第 12 周在 B 教室是两条不同 meeting；只有星期、节次、教师、地点及其他字段确实相同才可合并周次。
先逐字转录同一单元格的周次表达式，再确定性展开；例如原文“1-2周,4-10周,13-14周,16-18周”先记为“1-2,4-10,13-14,16-18”，然后展开为 [1,2,4,5,6,7,8,9,10,13,14,16,17,18]。输出前在内部把 weeks 重新压缩成范围，与原文正规化表达式逐段比较；不一致就重读原图，不可增添缺失周、漏掉中间周、复制邻格周次或直接猜数组。
教师与地点都是转录字段，不是预测字段。教师只能从同一课程块清晰可见的任课人原文逐字复制；不凭记忆补字，不从邻格借名字。地点只允许去掉“校区/场地”等标签并整理空白，建筑名、汉字和房间号须照同一块原文；例如“本部/敏行楼602”不可臆改成“德行楼602”，“尚智楼”不可臆改成“笃行楼”。OCR 与图像冲突时以可见图像/PDF 为准；仍看不清就请求更清晰来源，不做语言模型式自动纠错。
对同一课程名的多条 meeting 复核教师是否异常变化、地点是否只差形近字、节次是否异常缩短、来源单元格是否重复。同名不同教师可以是真的，但必须回到来源逐格确认；同名不同周次/教室不得互相串字段。高风险复查触发项：明确 1-8 或 1-10 被缩短；周次范围增漏；大量课程挤在同一星期；一格被拆成多条；相邻格交换教师、周次或地点；课程总条数正确但任一字段有误。它们只触发重看，不授权自动改写或删除。条数齐全、星期分布看似合理、JSON 结构有效都不能代替逐格逐字段核对。
合成示例仅用于理解而不可当作真实课表：一格写“课程甲 (1-8节)12周 教师甲 本部/敏行楼602”时，该格必须是一条 startPeriod=1、endPeriod=8、weeks=[12]、teacher="教师甲"、locationRaw="本部 敏行楼602"；另一格写“课程甲 (1-10节)15周 教师甲 尚智楼301”时是另一条，不能借用前一格的周次或地点。相邻格即使同名也分别核实。
学校名称未显示时 school.name=null；学校 ID 未显示或无法可靠确认时 school.id=null。不能从学年、学期、文件名、校区或课程名称猜测学校名称或 ID。示例结构里的学年、学期、课程字段都是占位说明，不是来源证据；原图和用户没有确认学年/学期时，必须先提问，绝不能复制示例、使用当前日期推断或输出看似有效的默认值。weekday 必须是已确认的 1–7 整数，当前导入格式不能表示“未确定星期”；无法确定课程块的物理星期列时，不要猜测、不要输出该 meeting 为可导入 JSON，也不要用 null/占位值伪装成有效星期；不要悄悄省略该块而输出不完整 JSON，应先向我提问并说明哪个块需要澄清。学年、学期、节次或周次等其他必需信息无法可靠确认时同样先提问。教师/地点若来源明确没有显示可以是 null；若看到了但无法辨清具体字符，不能猜测或静默写 null，应先请求更清晰来源。任一必需字段或可见原文字段无法可靠确认时，不要输出伪造、残缺但看似成功的可导入 JSON。全部逐格逐字段通过时，完成周次重新压缩等内部交叉核对，最终对用户只返回 JSON，不展示内部证据台账、Markdown、注释或推理。`;
  prompt.value = PROMPT;
  prompt.dataset.version = PROMPT_VERSION;
  const message = (value, error = false) => {
    status.textContent = value;
    status.className = error ? "error" : "muted";
    text.setAttribute("aria-invalid", String(error));
  };
  const preview = async () => {
    if (!text.value.trim()) { message("请先粘贴 AnyClass JSON。", true); text.focus(); return; }
    try {
      await AnyClassSharedJsonImport.previewText(text.value, "clipboard");
      message("JSON 校验通过，请核对下方导入预览。", false);
    } catch (error) { message(`JSON 校验失败：${error.message || "请检查格式"}`, true); text.focus(); }
  };
  $("clipboardPreview").addEventListener("click", preview);
  text.addEventListener("input", () => message("粘贴后点击“校验并预览”。"));
  $("clipboardRead").addEventListener("click", async () => {
    if (!isSecureContext || !navigator.clipboard?.readText) { message("无法直接读取剪贴板，请粘贴到下方文本框。"); text.focus(); return; }
    try {
      const value = await navigator.clipboard.readText();
      if (!value) { message("剪贴板中没有可读取的文本，请手动粘贴。"); text.focus(); return; }
      text.value = value;
      message("已读取文本，请校验并预览。");
    } catch (_) { message("无法直接读取剪贴板，请粘贴到下方文本框。"); text.focus(); }
  });
  $("clipboardCopyPrompt").addEventListener("click", async () => {
    try {
      if (!isSecureContext || !navigator.clipboard?.writeText) throw Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(PROMPT);
      $("clipboardPromptStatus").textContent = "提示词已复制。";
    } catch (_) {
      prompt.focus(); prompt.select();
      $("clipboardPromptStatus").textContent = "无法自动复制，已选中提示词，请手动复制。";
    }
  });
})();
