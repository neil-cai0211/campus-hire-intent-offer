// 校招录用意向书 · 运行配置
// 模板路径与字符下标表集中管理；模板被公司更新后需重新 dump 并更新本文件。
//
// 字符下标表说明：
//   fills: 字符级替换（保留下划线格式）。{ cell:'行,列', idx:字符下标, len:长度, field:字段名 }
//          len 是要覆盖的字符数；新内容若更长会顶掉后面的字符，所以同格多项必须按 idx 降序替换。
//   texts: Find/Replace（仅用于不带下划线的正文整段）
//
// ⚠ 指纹 fingerprint 用于模板版本校验：Size/LastWriteTime 与记录不符 = 模板被改过，
//   必须重新跑 scripts/dump-template.ps1 取新下标表，否则会静默填错位置。

// ── 路径 ────────────────────────────────────────────────────────────────
// 本机相关。跨机器使用时改这里，或用环境变量覆盖：
//   HIRE_WORKSPACE  录用意向书脚本工作区
//   HIRE_TEMPLATE_DIR  模板原件目录
const WORKSPACE = process.env.HIRE_WORKSPACE || 'D:\\AI-Workspace\\录用意向书';
const TEMPLATE_DIR = process.env.HIRE_TEMPLATE_DIR
  || 'D:\\人力资源部文档分类（模板）\\01招聘调配\\01表格模板\\入离调转流程及表单\\2-入职\\';

// ── 本机私密值 ──────────────────────────────────────────────────────────
// 真实姓名、电话、以及「必须与模板原文完全一致」的查找关键字放在 config.local.js
// （已被 .gitignore 排除，不进仓库）。未配置时回落到占位值——脚本会因匹配不到而
// 报错，这是刻意设计：宁可报错，也不要把真实号码写进版本库。
const local = (() => {
  try { return require('./config.local.js'); } catch (e) { return {}; }
})();

// 销售模板里需要被替换掉的原联系人姓名与电话（查找源，必须与模板原文逐字一致）
const SALES_CONTACT_FROM = local.salesContactFrom || '<销售模板原联系人姓名>';
const SALES_PHONE_FROM = local.salesContactPhoneFrom || '<销售模板原联系人电话>';
// 要写入意向书的 HR 联系人
const CONTACT_PHONE = local.contactPhone || '<HR手机号>';

module.exports = {
  WORKSPACE,
  TEMPLATE_DIR,

  templates: {
    // 1-2 职能及技术类 —— 技术线通用模板（本批13人使用）
    tech: {
      label: '职能及技术类',
      file: '1-2 录用意向书_职能及技术类_-25-01版_中文(2).doc',
      fingerprint: { size: 53344, mtime: '2026-10-21T09:18:59' },
      rows: 18, cols: 4,
      fixedParts: { basic: 80, secret: 5, perf: 15 },   // 基本/保密/绩效
      salutation: { para: 3, idx: 0, len: 6 },
      fills: [
        { cell: '1,2',  idx: 6,  len: 6, field: 'job' },          // □职位名称：中级招聘专员
        { cell: '3,2',  idx: 8,  len: 5, field: 'dept' },         // □部    门：人力资源部
        { cell: '4,2',  idx: 6,  len: 2, field: 'boss' },         // □职位名称：VP
        { cell: '5,2',  idx: 9,  len: 2, field: 'day' },          // □2026年10月23日
        { cell: '5,2',  idx: 6,  len: 2, field: 'month' },
        { cell: '5,2',  idx: 1,  len: 4, field: 'year' },
        { cell: '6,2',  idx: 19, len: 2, field: 'endDay' },       // 3年以上，终止日期为合同终止年的12月31日
        { cell: '6,2',  idx: 16, len: 2, field: 'endMonth' },
        { cell: '6,2',  idx: 0,  len: 1, field: 'endYears' },
        { cell: '10,2', idx: 16, len: 4, field: 'fullInc' },      // 转正后收入：…8000元人民币
        { cell: '13,2', idx: 15, len: 4, field: 'basic' },        // 80%，即6400元
        { cell: '13,3', idx: 14, len: 3, field: 'secret' },       // 5%，即400元
        { cell: '13,4', idx: 15, len: 4, field: 'perf' },         // 15%，即1200元
        { cell: '16,2', idx: 18, len: 2, field: 'validDay' },     // 本通知书有效日期至2026年10月23日
        { cell: '16,2', idx: 15, len: 2, field: 'validMonth' },
        { cell: '16,2', idx: 10, len: 4, field: 'validYear' },
      ],
      texts: [
        { cell: '2,2', from: '福建福州及您参与的项目或工作任务所涉及的区域', field: 'location' },
        { cell: '7,2', from: '试用期限为6个月', field: 'probMonthsText' },
      ],
    },

    // 1-1 销售通用类 —— 销售线模板（16行，两项固定部分，无绩效）
    sales: {
      label: '销售通用类',
      file: '1-1 录用意向书_销售通用类_-25-01版_中文(1).doc',
      fingerprint: { size: 55183, mtime: '2025-12-27T22:49:36' },
      rows: 16, cols: 3,
      fixedParts: { basic: 95, secret: 5, perf: 0 },   // 销售无绩效激励项
      salutation: { para: 3, idx: 0, len: 6 },
      fills: [
        { cell: '1,2',  idx: 8,  len: 10, field: 'job' },         // 职位/职级名称：
        { cell: '2,2',  idx: 5,  len: 8,  field: 'location' },   // 工作地点：____及您参与…
        { cell: '3,2',  idx: 7,  len: 19, field: 'dept' },        // 部    门：____
        { cell: '4,2',  idx: 7,  len: 14, field: 'boss' },        // 上级职位名称：____
        { cell: '5,2',  idx: 13, len: 6,  field: 'day' },         // ____年__月__日
        { cell: '5,2',  idx: 8,  len: 4,  field: 'month' },
        { cell: '5,2',  idx: 0,  len: 7,  field: 'year' },
        { cell: '6,2',  idx: 26, len: 8,  field: 'endDay' },      // ____年以上…___月____日
        { cell: '6,2',  idx: 20, len: 5,  field: 'endMonth' },
        { cell: '6,2',  idx: 0,  len: 5,  field: 'endYears' },
        { cell: '10,2', idx: 18, len: 4,  field: 'fullInc' },     // 转正后收入：…4000元
        { cell: '12,2', idx: 19, len: 4,  field: 'basic' },       // 95%，即3800元
        { cell: '12,3', idx: 17, len: 3,  field: 'secret' },      // 5%，即200元
        { cell: '15,2', idx: 26, len: 7,  field: 'validDay' },    // 有效日期至____年__月__日
        { cell: '15,2', idx: 18, len: 7,  field: 'validMonth' },
        { cell: '15,2', idx: 9,  len: 8,  field: 'validYear' },
      ],
      texts: [
        { from: SALES_CONTACT_FROM, field: 'contact' },
        { from: SALES_PHONE_FROM, field: 'contactPhone' },   // 11位（不是12位）
      ],
    },

    // 以下三套尚未做结构分析，用到时先跑 dump-template.ps1
    brand: {
      label: '品牌营销类',
      file: '1-1 录用意向书_品牌营销类_-25-01版_中文(1)(1).doc',
      fingerprint: { size: 56795, mtime: '2026-09-03T16:32:08' },
      analyzed: false,
    },
    other: {
      label: '其他',
      file: '1-2 录用意向书_其他_-25-01版_中文.doc',
      fingerprint: { size: 53860, mtime: '2025-12-29T23:56:51' },
      analyzed: false,
    },
    expatriate: {
      label: '销售外派类',
      file: '1-3 录用意向书_销售外派类_-25-01版_中文.doc',
      fingerprint: { size: 60407, mtime: '2025-12-27T22:50:42' },
      analyzed: false,
    },
  },

  // 固定业务口径（Neil 拍板）
  rules: {
    onboardDate: { year: '2027', month: '7', day: '1' },      // 意向书入职日期
    approvalOnboardDate: '2027/06/01',                        // 录用审批里的入职日期（不同！）
    contractYears: '3',                                        // 首期合同期限年限
    validDays: 3,                                             // offer有效期天数（含当天）
    contact: 'HR 联系人（姓名见 config.local.js）',
    contactPhone: CONTACT_PHONE,
    probationMonths: 6,
    workCity: '福建福州',
  },
};
