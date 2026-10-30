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
      analyzed: true,
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
      analyzed: true,
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

    // 1-1 品牌营销类 —— 95/5 两项固定部分（无绩效），试用期 3 个月
    // 16 行 3 列。待填位多为「已有示例文字」，仍按下划线槽位字符级替换。
    brand: {
      label: '品牌营销类',
      file: '1-1 录用意向书_品牌营销类_-25-01版_中文(1)(1).doc',
      fingerprint: { size: 56795, mtime: '2026-09-03T16:32:08' },
      analyzed: true,
      rows: 16, cols: 3,
      fixedParts: { basic: 95, secret: 5, perf: 0 },   // 无绩效激励项
      salutation: { para: 2, idx: 0, len: 3 },
      fills: [
        { cell: '1,2',  idx: 8,  len: 13, field: 'job' },         // 职位/职级名称：初级媒体运营专员
        { cell: '2,2',  idx: 5,  len: 20, field: 'location' },   // 您的属地：福州
        { cell: '3,2',  idx: 7,  len: 26, field: 'dept' },        // 部    门：Brand Promotion(品牌推广部)
        { cell: '4,2',  idx: 7,  len: 10, field: 'boss' },        // 上级职位名称：品牌营销VP
        { cell: '5,2',  idx: 13, len: 5,  field: 'day' },         // 2026 年 04 月 15 日
        { cell: '5,2',  idx: 8,  len: 4,  field: 'month' },
        { cell: '5,2',  idx: 0,  len: 4,  field: 'year' },
        { cell: '6,2',  idx: 23, len: 5,  field: 'endDay' },      // 3 年以上，终止日期为合同终止年的 06 月 30 日
        { cell: '6,2',  idx: 18, len: 4,  field: 'endMonth' },
        { cell: '6,2',  idx: 0,  len: 3,  field: 'endYears' },
        { cell: '7,2',  idx: 5,  len: 4,  field: 'probMonths' },  // 试用期限为 3 个月
        { cell: '10,2', idx: 16, len: 11, field: 'fullInc' },     // 转正后收入：…6500 元
        { cell: '12,2', idx: 16, len: 7,  field: 'basic' },        // 95%，即 ____ 元
        { cell: '12,3', idx: 15, len: 7,  field: 'secret' },       // 5%，即 ____ 元
        { cell: '15,2', idx: 25, len: 6,  field: 'validDay' },     // 有效日期至 2026 年 04 月 15 日
        { cell: '15,2', idx: 19, len: 5,  field: 'validMonth' },
        { cell: '15,2', idx: 9,  len: 9,  field: 'validYear' },
      ],
      texts: [],
    },

    // 1-2 其他 —— 80/5/13 三项固定部分（示例为大客户经理，成都主体）
    // 15 行 4 列。绩效激励是 13%（不是 15%），与职能技术类不同。
    other: {
      label: '其他',
      file: '1-2 录用意向书_其他_-25-01版_中文.doc',
      fingerprint: { size: 53860, mtime: '2025-12-29T23:56:51' },
      analyzed: true,
      rows: 15, cols: 4,
      fixedParts: { basic: 80, secret: 5, perf: 13 },
      salutation: { para: 2, idx: 0, len: 3 },
      fills: [
        { cell: '1,2',  idx: 6,  len: 7,  field: 'job' },         // 职位名称：大客户经理
        { cell: '2,2',  idx: 6,  len: 4,  field: 'location' },    // 工作地点：成都
        { cell: '3,2',  idx: 8,  len: 5,  field: 'dept' },        // 部    门：销售线
        { cell: '4,2',  idx: 6,  len: 6,  field: 'boss' },        // 职位名称：销售VP
        { cell: '5,2',  idx: 13, len: 4,  field: 'day' },
        { cell: '5,2',  idx: 8,  len: 4,  field: 'month' },
        { cell: '5,2',  idx: 1,  len: 6,  field: 'year' },
        { cell: '6,2',  idx: 25, len: 6,  field: 'endDay' },      // 3 年以上，终止日期为合同终止年的 03 月 31 日
        { cell: '6,2',  idx: 18, len: 6,  field: 'endMonth' },
        { cell: '6,2',  idx: 0,  len: 3,  field: 'endYears' },
        { cell: '7,2',  idx: 5,  len: 5,  field: 'probMonths' },  // 试用期限为 6 个月
        { cell: '11,2', idx: 16, len: 7,  field: 'basic' },        // 80%，即 12250 元
        { cell: '11,3', idx: 15, len: 7,  field: 'secret' },       // 5%，即 750 元
        { cell: '11,4', idx: 16, len: 8,  field: 'perf' },         // 13%，即 2000 元
        { cell: '14,2', idx: 24, len: 6,  field: 'validDay' },
        { cell: '14,2', idx: 17, len: 6,  field: 'validMonth' },
        { cell: '14,2', idx: 10, len: 6,  field: 'validYear' },
      ],
      texts: [],
    },

    // 1-3 销售外派类 —— 驻外岗，含「约定服务期」与签证失效条款
    // 18 行 4 列。薪酬三项的百分比与金额都是空槽（模板不给示例值）。
    expatriate: {
      label: '销售外派类',
      file: '1-3 录用意向书_销售外派类_-25-01版_中文.doc',
      fingerprint: { size: 60407, mtime: '2025-12-27T22:50:42' },
      analyzed: true,
      rows: 18, cols: 4,
      fixedParts: { basic: null, secret: null, perf: null },   // 百分比也需填
      salutation: { para: 2, idx: 0, len: 3 },
      fills: [
        { cell: '1,2',  idx: 8,  len: 6,  field: 'job' },         // 职位/职级名称：外派销售代表
        { cell: '2,2',  idx: 5,  len: 8,  field: 'location' },
        { cell: '3,2',  idx: 7,  len: 25, field: 'dept' },        // 部    门：Sales China
        { cell: '4,2',  idx: 7,  len: 12, field: 'boss' },        // 上级职位名称：销售VP
        { cell: '5,2',  idx: 12, len: 5,  field: 'day' },         // 2025 年 x 月 x 日
        { cell: '5,2',  idx: 8,  len: 3,  field: 'month' },
        { cell: '5,2',  idx: 0,  len: 7,  field: 'year' },
        { cell: '6,2',  idx: 25, len: 8,  field: 'endDay' },      // 3 年以上，终止日期为合同终止年的 12 月 31 日
        { cell: '6,2',  idx: 19, len: 5,  field: 'endMonth' },
        { cell: '6,2',  idx: 0,  len: 4,  field: 'endYears' },
        { cell: '7,2',  idx: 13, len: 3,  field: 'probMonths' },  // 试用期 6 个月，每 3 个月考核
        { cell: '7,2',  idx: 6,  len: 3,  field: 'probMonths2' },
        { cell: '10,2', idx: 17, len: 8,  field: 'probRatio' },    // 试用期收入 × ____
        { cell: '11,2', idx: 16, len: 9,  field: 'fullInc' },     // 转正后收入：____ 元
        { cell: '14,2', idx: 11, len: 3,  field: 'basicPct' },     // 约占 ____ %，即 ____ 元
        { cell: '14,2', idx: 17, len: 8,  field: 'basicAmt' },
        { cell: '14,3', idx: 11, len: 3,  field: 'secretPct' },
        { cell: '14,3', idx: 17, len: 8,  field: 'secretAmt' },
        { cell: '14,4', idx: 11, len: 3,  field: 'perfPct' },
        { cell: '14,4', idx: 17, len:8,  field: 'perfAmt' },
        { cell: '17,2', idx: 9,  len: 8,  field: 'validYear' },
        { cell: '17,2', idx: 18, len: 6,  field: 'validMonth' },
        { cell: '17,2', idx: 25, len: 7,  field: 'validDay' },
      ],
      texts: [],
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

  // ── 社招录用审批（链路一B）──────────────────────────────────────────
  social: {
    // 试用期月数：销售 6 个月，其他 3 个月；校招一律 6 个月
    probationMonths: { sales: 6, default: 3, campus: 6 },

    // 薪酬结构（转正前 / 转正后两套字段，比例以满额为基准）
    // ratio 顺序：基本工资 / 保密津贴 / 绩效工资
    payStructure: {
      default:     { full: [80, 5, 15], prob: [80, 5, 0] },   // 通用
      sales:       { full: [95, 5, 0],  prob: [95, 5, 0] },   // 销售线
      brandMarketing: { full: [95, 5, 0], prob: [95, 5, 0] },  // 品牌营销线（平面设计师除外）
    },
    // 例外：平面设计师走通用 80/5/15
    payExceptions: { '初级平面设计师': 'default', '中级平面设计师': 'default', '高级平面设计师': 'default', '资深平面设计师': 'default' },

    // 岗位线 → 录用意向书模板
    // 判据是「固定部分比例」（与薪酬口径必须一致），不是校招/社招。
    // ⚠ 比例对不上就是填错：销售线的人用了 tech 模板会变成 80/5/15，与审批表冲突。
    // ⚠ brand 与 sales 固定部分相同（95/5），区别在表述与试用期示例：
    //    sales 试用期示例 6 个月、brand 3 个月；brand 用「属地」而非「工作地点」。
    templateByLine: {
      tech:              'tech',        // 职能/技术/研发/产品/技术支持/客户成功线
      engineering:       'tech',
      rd:                'tech',
      product:           'tech',
      techSupport:       'tech',
      customerSuccess:   'tech',
      sales:             'sales',       // 销售线（含电销）
      brandMarketing:    'brand',       // 品牌营销线（平面设计师除外）
      other:             'other',       // 未归类（80/5/13）
      expatriate:        'expatriate',  // 驻外/外派
    },

    // 枚举选项（实测）
    enums: {
      probation: ['无', '1个月', '2个月', '3个月', '4个月', '5个月', '6个月'],
      contractSubject: ['福州誉龙智能科技有限公司', '成都先锋寰宇科技有限公司'],
      hireType: ['首次录用', '离职返聘', '退休返聘'],
      reportAddress: [
        '福建省福州市鼓楼区火炬高新技术创业园1号楼',
        '成都武侯区莱普敦中心3号楼3栋2单元1106',
      ],
      jobTreeCategories: ['技术', '营销', '职能', '管理', '未定义分类'],
    },

    // 工作城市（el-cascader 两级）
    workCity: { province: '福建省', city: '福州市' },

    // 报到信息默认值
    defaults: {
      reportAddress: '福建省福州市鼓楼区火炬高新技术创业园1号楼',
      hireType: '首次录用',
    },

    // 岗位 → 部门映射（入职部门是自由文本框，无下拉；来源：Neil 拍板 + 花名册核对）
    // 全路径格式：<一级部门>/<二级部门>/<三级部门>（花名册里的写法）
    jobDeptMap: {
      '初级实施专员': {
        dept: '远程实施组',
        fullPath: 'CS Dpt.(客户成功线)/Implementation(远程实施部)/远程实施组',
        seq: '营销序列-S', rank: 'S1',
        leader: local.socialLeader || '<远程实施组 Leader>',
        pay: 'default',
      },
      '中级实施专员': { dept: '远程实施组', fullPath: 'CS Dpt.(客户成功线)/Implementation(远程实施部)/远程实施组', seq: '营销序列-S', rank: 'S2', pay: 'default' },
      '高级实施专员': { dept: '远程实施组', fullPath: 'CS Dpt.(客户成功线)/Implementation(远程实施部)/远程实施组', seq: '营销序列-S', rank: 'S3', pay: 'default' },
      '资深实施专员': { dept: '远程实施组', fullPath: 'CS Dpt.(客户成功线)/Implementation(远程实施部)/远程实施组', seq: '营销序列-S', rank: 'S4', pay: 'default' },
    },

    // 一级部门 → Leader（组织架构页 /organization/framework）
    // 真实姓名在 config.local.js 的 deptLeaders 里（不进版本库）；
    // 这里只保留「部门 → 谁是 Leader」的映射骨架与无负责人的标注。
    deptLeaders: {
      'S&I Dpt.(战略与创新线)': local.deptLeaders && local.deptLeaders['S&I Dpt.(战略与创新线)'] || '<待填>',
      'Sales Dpt.(销售线)': '(无负责人)',
      'Brand Marketing Dpt.(品牌营销线)': local.deptLeaders && local.deptLeaders['Brand Marketing Dpt.(品牌营销线)'] || '<待填>',
      'CS Dpt.(客户成功线)': local.deptLeaders && local.deptLeaders['CS Dpt.(客户成功线)'] || '<待填>',
      'R&D Dpt.(产品研发线)': local.deptLeaders && local.deptLeaders['R&D Dpt.(产品研发线)'] || '<待填>',
      'HR&ADM Dpt.(人力行政线)': local.deptLeaders && local.deptLeaders['HR&ADM Dpt.(人力行政线)'] || '<待填>',
      'Finance Dpt.(财务线)': '(无负责人)',
    },
  },
};
