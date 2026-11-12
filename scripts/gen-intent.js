// 录用意向书生成 v4：单元格内 Find/Replace 精确替换，保留下划线格式
// 用法: node gen-intent.js '<JSON配置>'
//
// 模板路径与输出目录都从 config.js / 环境变量取，不写死本机路径。
//   HIRE_WORKSPACE  录用意向书工作区（默认含 out/ 与 people.js）
//   HIRE_WORK_DIR   中间文件目录（ps1 + json），**必须纯 ASCII**
//   HIRE_OUT_DIR    PDF 输出目录
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const SKILL_CFG = require(path.join(SKILL_DIR, 'config.js'));

const WORKSPACE = process.env.HIRE_WORKSPACE || 'D:\\AI-Workspace\\录用意向书';
const TEMPLATE = path.join(SKILL_CFG.TEMPLATE_DIR, SKILL_CFG.templates.tech.file);
// 工作目录必须纯 ASCII：ps1 源文件被 PowerShell 5.1 按 GBK 读，中文路径会破坏
const WORK = process.env.HIRE_WORK_DIR || path.join(WORKSPACE, '.work');
const OUT = process.env.HIRE_OUT_DIR || path.join(WORKSPACE, 'out');

const cfg = JSON.parse(process.argv[2]);
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ⚠ 必填校验：任一字段缺失都会在 Word 里印成 "NaN" 或空，
//   而导出过程**不报错**（静默产出错误文件）。宁可中止也不能出错的意向书。
const REQUIRED = ['name', 'job', 'dept', 'boss', 'probMonths', 'probRatio',
  'fullInc', 'basic', 'secret', 'perf', 'endYears', 'outName',
  'validYear', 'validMonth', 'validDay',
  'basicPct', 'secretPct', 'perfPct'];
const missing = REQUIRED.filter(k => cfg[k] === undefined || cfg[k] === null || cfg[k] === '');
if (missing.length) {
  console.error('✗ 配置缺字段: ' + missing.join(', '));
  process.exit(3);
}
// 金额必须自洽：固定部分三项之和 = 转正后满额
const sum = Number(cfg.basic) + Number(cfg.secret) + Number(cfg.perf);
if (sum !== Number(cfg.fullInc)) {
  console.error(`✗ 固定部分合计 ${sum} ≠ 转正后满额 ${cfg.fullInc}`);
  process.exit(3);
}
// 比例文字与金额必须自洽（模板正文里的比例是单独的字，不校验会自相矛盾）
for (const [k, v] of [['basic', cfg.basicPct], ['secret', cfg.secretPct], ['perf', cfg.perfPct]]) {
  const pct = (Number(cfg[k]) / Number(cfg.fullInc) * 100).toFixed(0);
  if (pct !== String(v)) {
    console.error(`✗ ${k} 金额 ${cfg[k]} 对应比例 ${pct}%，但配置写的是 ${v}%`);
    process.exit(3);
  }
}
if (!cfg.blankDates) {
  for (const k of ['year', 'month', 'day', 'endMonth', 'endDay']) {
    if (!cfg[k]) { console.error('✗ 未设 blankDates 且缺字段: ' + k); process.exit(3); }
  }
}

// 「留空」模式：入职日期待定时，保留模板的下划线结构但填空白，
// 而不是把模板的示例值（如 2026年11月2日）印在发给候选人的文件上。
// 空格数量 = 原槽位长度 ⇒ 下划线格式完整继承，视觉上就是「____年__月__日」。
const BLANK = cfg.blankDates
  ? { d5Year: ' '.repeat(4), d5Month: ' '.repeat(2), d5Day: ' '.repeat(1),
      d6Month: ' '.repeat(2), d6Day: ' '.repeat(2) }
  : { d5Year: cfg.year, d5Month: cfg.month, d5Day: cfg.day,
      d6Month: cfg.endMonth, d6Day: cfg.endDay };

// Word COM 只能写 ASCII 路径 -> 先输出到 WORK，再由 Node 复制到中文名
// 用时间戳避免文件被占用导致导出失败
const stamp = Date.now();
const pdfAscii = path.join(WORK, `intent-${cfg.no}-${stamp}.pdf`);
const pdfFinal = path.join(OUT, `${cfg.outName}.pdf`);

// 替换指令（全部通过 JSON 传递，ps1 保持纯 ASCII）
// 分段替换以精确对应下划线范围：
//   "10月"->"7月"：'1''0'有下划线->'7'继承下划线；'月'无下划线保持
//   "23日"->"1日"：'2''3'有下划线->'1'继承下划线；'日'无下划线保持
const psData = {
  template: TEMPLATE,
  pdf: pdfAscii,
  name: cfg.name,
  // 字符级替换：按 cell + 字符下标 + 长度，格式（下划线）自动继承
  // 好处：不依赖模板里的示例值，日期/金额可任意变化
  //
  // ⚠⚠ 下标与长度**绑定模板版本**。2026-11-04 tech 模板改版（53344→53308 字节），
  //   3 处槽位长度变了（见下）。改模板必须重跑 dump-template.ps1 + parse-slots.js
  //   + verify-slots.js 复核，verify 报「对齐」才说明长度也一致。
  cellReplaces: [
    // R1C2 「□职位名称：」+ 下划线「中级技术支持专员」(idx6-13, 8位) → 职位名
    { cell: '1,2', idx: 6, len: 8, text: cfg.job },
    // R3C2 「□部    门：」+ 下划线「技术支持部」(idx8-12, 5位) → 部门
    { cell: '3,2', idx: 8, len: 5, text: cfg.dept },
    // R4C2 「□职位名称：」+ 下划线「VP」(idx6-7, 2位) → 汇报上级
    { cell: '4,2', idx: 6, len: 2, text: cfg.boss },
    // R5C2 「□2026年11月2日 ... ☑待签订...」
    //   下划线 idx1-4(年,4) idx6-7(月,2) idx9(日,1)
    //   ⚠ 2026-11-04 改版：日的槽位从 2 位变 1 位（旧版 idx9-10 是「23」）
    //   ⚠ blankDates=true 时留空（保留「____年__月__日」的下划线结构，不填示例值）
    { cell: '5,2', idx: 9, len: 1, text: BLANK.d5Day },
    { cell: '5,2', idx: 6, len: 2, text: BLANK.d5Month },
    { cell: '5,2', idx: 1, len: 4, text: BLANK.d5Year },
    // R6C2 「3年以上，终止日期为合同终止年的12月31日」
    //   下划线 idx16-17(月,2) idx19-20(日,2)；年限 idx0='3'
    { cell: '6,2', idx: 19, len: 2, text: BLANK.d6Day },
    { cell: '6,2', idx: 16, len: 2, text: BLANK.d6Month },
    { cell: '6,2', idx: 0, len: 1, text: cfg.endYears },
    // R7C2 「试用期限为3个月」→ 试用期月数（数字在下划线里, idx5, 1位）
    { cell: '7,2', idx: 5, len: 1, text: String(cfg.probMonths) },
    // R9C2 「试用期收入：目标税前月收入满额 × 100%」
    //   下划线 idx17-24（raw=" 100%   "），值部分是 idx18-21 = "100%"（4位）
    //   ⚠ 2026-11-04 改版：旧模板写死 85%，新版把比例变成可填槽位（示例值 100%）
    //   ⇒ 必须显式填 cfg.probRatio，否则会输出「× 100%」= 试用期不打折（错）
    { cell: '9,2', idx: 18, len: 4, text: (cfg.probRatio || '85') + '%' },
    // R10C2 「转正后收入：目标税前月收入满额：6800元人民币」→ 数字 idx16-19
    { cell: '10,2', idx: 16, len: 4, text: cfg.fullInc },
    // R13C2 「占目标税前收入满额的80%，即5440元人民币」→ 数字 idx15-18
    { cell: '13,2', idx: 15, len: 4, text: cfg.basic },
    // R13C3 「…5%，即340元人民币」→ 数字 idx14-16
    { cell: '13,3', idx: 14, len: 3, text: cfg.secret },
    // R13C4 「…15%，即1020元人民币」→ 数字 idx15-18
    { cell: '13,4', idx: 15, len: 4, text: cfg.perf },
    // R16C2 「本通知书有效日期至2026年11月2日」
    //   下划线 idx10-13(年,4) idx15-16(月,2) idx18(日,1)
    //   ⚠ 2026-11-04 改版：日的槽位从 2 位变 1 位（旧版 idx18-19 是「23」）
    //   ⚠ 必须与 offer 表单的「offer有效期」一致：N 天 = 发送当天起算 N 天（含当天）
    //     例：10-29 发送 + 3 天 → 10.29/10.30/10.31 → 2026年10月31日
    { cell: '16,2', idx: 18, len: 1, text: String(Number(cfg.validDay)) },
    { cell: '16,2', idx: 15, len: 2, text: String(Number(cfg.validMonth)) },
    { cell: '16,2', idx: 10, len: 4, text: cfg.validYear },
  ],
  // R2C2 工作地点整段替换（模板原文「□工作地点：福建福州及您参与的项目或工作任务所涉及的区域」）
  //      —— 这段不是下划线，是正文，单独用 Find 替换整串
  textReplaces: [
    { cell: '2,2', from: '福建福州及您参与的项目或工作任务所涉及的区域', to: cfg.location },
    // ⚠ R13 三列的**比例文字是模板正文里的普通字**（不是下划线槽位），
    //   模板写死 80%/5%/15%。管理序列是 75/5/20 ⇒ 必须改，否则金额与比例自相矛盾。
    { cell: '13,2', from: '占目标税前收入满额的80%，', to: '占目标税前收入满额的' + cfg.basicPct + '%，' },
    { cell: '13,3', from: '占目标税前收入满额的5%，', to: '占目标税前收入满额的' + cfg.secretPct + '%，' },
    { cell: '13,4', from: '占目标税前收入满额的15%，', to: '占目标税前收入满额的' + cfg.perfPct + '%，' },
  ],
  // 称呼（「XXX：您好！」）里的示例人名会随模板改版而变：
  //   2025 版 =「赖沄葱」，2026-11-04 版 =「林清云」
  // ⇒ 硬编码必然踩坑（漏替换 ⇒ 意向书上印的是模板示例人名）。
  //   改为**在 PS 端自动探测**：正则匹配「2-4 个汉字 + ：您好」并取捕获组，
  //   探测不到就报错中止，绝不静默产出错的称呼。
  // ⚠ 正则走 JSON 传递（ps1 源文件必须是纯 ASCII，中文字面量会破坏解析）。
  salutationRegex: '^([\\u4e00-\\u9fa5]{2,4})\\uff1a\\u60a8\\u597d',
};

const ps = [
  "$ErrorActionPreference = 'Stop'",
  "Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force",
  "Start-Sleep -Seconds 3",
  "# clean Word resiliency + autorecover leftovers: force-killed WINWORD leaves them,",
  "# which makes Documents.Open hang silently on a hidden 'document recovery' pane",
  "try { Get-ChildItem \"$env:APPDATA\\Microsoft\\Word\" -Filter '*.asd' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch {}",
  "try { Remove-Item 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Word\\Resiliency' -Recurse -Force -ErrorAction SilentlyContinue } catch {}",
  "Start-Sleep -Seconds 2",
  `$raw = Get-Content -Raw -Encoding UTF8 '${path.join(WORK, '_data.json')}'`,
  "$D = $raw | ConvertFrom-Json",
  "$w = New-Object -ComObject Word.Application",
  "$w.Visible = $false",
  "$w.DisplayAlerts = 0",
  "$w.AutomationSecurity = 3",
  "# ReadOnly=$true : avoids the file write lock (and the hidden prompt that hangs it)",
  "$doc = $w.Documents.Open([string]$D.template, $false, $true)",
  "$tb = $doc.Tables.Item(1)",
  "",
  "# char-level replace: collect absolute positions first, then replace from the end",
  "# (mutating while enumerating Characters corrupts the COM enumerator)",
  "$targets = New-Object System.Collections.ArrayList",
  "foreach ($cr in $D.cellReplaces) {",
  "  $parts = $cr.cell -split ','",
  "  $rg = $tb.Cell([int]$parts[0], [int]$parts[1]).Range",
  "  $base = [int]$rg.Start",
  "  $i = 0",
  "  $need = 1",
  "  if ($null -ne $cr.PSObject.Properties['len']) { $need = [int]$cr.len }",
  "  foreach ($c in $rg.Characters) {",
  "    $t = $c.Text",
  "    if ($t -ne \"`r\" -and $t -ne \"`a\") {",
  "      if ($i -eq [int]$cr.idx) {",
  "        $null = $targets.Add([PSCustomObject]@{ Pos = ($base + [int]($c.Start - $base)); Len = $need; Txt = [string]$cr.text })",
  "      }",
  "      $i++",
  "    }",
  "  }",
  "}",
  "foreach ($tg in ($targets | Sort-Object -Property Pos -Descending)) {",
  "  $r = $doc.Range([int]$tg.Pos, [int]$tg.Pos + [int]$tg.Len)",
  "  $r.Text = [string]$tg.Txt",
  "}",
  "",
  "# plain-text cell replace (Find/Replace keeps formatting; Wrap=0 limits to the cell)",
  "foreach ($cr in $D.textReplaces) {",
  "  $parts = $cr.cell -split ','",
  "  $rg = $tb.Cell([int]$parts[0], [int]$parts[1]).Range",
  "  $f = $rg.Find",
  "  $f.ClearFormatting()",
  "  $f.Replacement.ClearFormatting()",
  "  $f.Text = $cr.from",
  "  $f.Replacement.Text = $cr.to",
  "  $f.Forward = $true",
  "  $f.Wrap = 0",
  "  $f.MatchCase = $false",
  "  $f.MatchWholeWord = $false",
  "  $f.Execute($cr.from, $false, $false, $false, $false, $false, $true, 0, $false, $cr.to, 2) | Out-Null",
  "}",
  "",
  "# salutation replace: auto-detect the template's placeholder name",
  "# (it changes on every template revision -> hardcoding silently prints the wrong name)",
  "$sal = $null",
  "foreach ($para in $doc.Paragraphs) {",
  "  $pt = $para.Range.Text",
  "  if ($pt -match $D.salutationRegex) { $sal = $matches[1]; break }",
  "}",
  "if (-not $sal) { Write-Output 'SALUTATION_NOT_FOUND'; $w.Quit(); exit 9 }",
  "$f = $doc.Content.Find",
  "$f.ClearFormatting()",
  "$f.Replacement.ClearFormatting()",
  "$f.Text = $sal",
  "$f.Replacement.Text = [string]$D.name",
  "$f.Forward = $true",
  "$f.Wrap = 1",
  "$f.MatchCase = $false",
  "$f.MatchWholeWord = $false",
  "$f.Execute($sal, $false, $false, $false, $false, $false, $true, 1, $false, [string]$D.name, 2) | Out-Null",
  "Write-Output ('SALUTATION_OK:' + $sal + '->' + [string]$D.name)",
  "",
  "$doc.ExportAsFixedFormat($D.pdf, 17)",
  "$doc.Close($false)",
  "$w.Quit()",
  "Write-Output 'WORD_OK'",
  "",
].join('\r\n');

fs.writeFileSync(path.join(WORK, '_data.json'), JSON.stringify(psData, null, 1), 'utf8');
// ⚠ ps1 必须是纯 ASCII：中文注释也会让 PS 5.1 解析出错（乱码 → 语法错误）
if (/[^\x00-\x7F]/.test(ps)) {
  console.error('✗ ps1 含非 ASCII 字符，会被 PowerShell 5.1 按 GBK 解析而失败');
  process.exit(4);
}
fs.writeFileSync(path.join(WORK, '_fill.ps1'), ps, 'ascii');
try {
  const o = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(WORK, '_fill.ps1')], { encoding: 'utf8' });
  console.log('Word:', (o || '').trim());
} catch (e) {
  console.error('Word 失败:', (e.stdout || '').toString(), (e.stderr || '').toString());
  process.exit(2);
}

fs.copyFileSync(pdfAscii, pdfFinal);
console.log('PDF:', pdfFinal, fs.statSync(pdfFinal).size, 'bytes');
