// 列出校招候选人清单与口径状态
// 用法: node list-people.js [工作区路径]
// 默认工作区: D:/AI-Workspace/录用意向书
const path = require('path');
const fs = require('fs');

const WORK = process.argv[2] || 'D:/AI-Workspace/录用意向书';
const PEOPLE = path.join(WORK, 'people.js');
const CONFIG = path.join(__dirname, '..', 'config.js');

if (!fs.existsSync(PEOPLE)) {
  console.log('✗ 找不到 people.js:', PEOPLE);
  process.exit(1);
}

const people = require(PEOPLE);
const cfg = require(CONFIG);

console.log('='.repeat(72));
console.log('校招录用意向书 · 人员清单');
console.log('='.repeat(72));

const need = [];
people.forEach((p) => {
  const tpl = p.template || 'tech';
  const tplDef = cfg.templates[tpl];
  const gaps = [];

  if (!p.job) gaps.push('职位名称');
  if (!p.dept) gaps.push('入职部门');
  if (!p.boss) gaps.push('汇报上级');
  if (!p.fullInc) gaps.push('转正后收入');
  if (!p.basic) gaps.push('基本工资');
  if (!p.secret) gaps.push('保密津贴');
  if (tpl === 'tech' && !p.perf) gaps.push('绩效激励');
  // 销售模板无绩效项：perf 为空或 '0' 都算正常
  if (tpl === 'sales' && p.perf && Number(p.perf) !== 0) gaps.push('销售岗固定部分仅95%/5%，perf应为0');
  if (!p.outName) gaps.push('outName');

  const flag = gaps.length ? '✗' : '✓';
  console.log(`${flag} ${String(p.no).padStart(2)} ${p.name.padEnd(5)} ${String(tplDef ? tplDef.label : tpl).padEnd(12)} 有效期至 ${p.validDate}  ${gaps.length ? '缺: ' + gaps.join('/') : ''}`);
  if (gaps.length) need.push(p.name);
});

console.log('-'.repeat(72));
console.log(`共 ${people.length} 人；口径齐全 ${people.length - need.length} 人，待补 ${need.length} 人`);
if (need.length) console.log('待补：' + need.join('、'));

console.log('\n=== 模板版本指纹（用于校验公司是否更新过模板）===');
for (const [key, t] of Object.entries(cfg.templates)) {
  const fp = t.fingerprint || {};
  const full = path.join(cfg.TEMPLATE_DIR, t.file);
  let status = '未分析';
  if (fs.existsSync(full)) {
    const fi = fs.statSync(full);
    const same = fi.size === fp.size;
    status = same ? '一致' : `已变更(size ${fp.size} -> ${fi.size}) 需重新 dump`;
  } else {
    status = '模板文件缺失';
  }
  console.log(`  ${key.padEnd(10)} ${t.label.padEnd(12)} ${status}`);
}

console.log('\n=== 业务口径（config.js）===');
const r = cfg.rules;
console.log(`  意向书入职日期   ${r.onboardDate.year}-${r.onboardDate.month}-${r.onboardDate.day}`);
console.log(`  录用审批入职日期 ${r.approvalOnboardDate}`);
console.log(`  合同期限         ${r.contractYears}年以上，终止日期为合同终止年的9月30日`);
console.log(`  offer有效期      ${r.validDays}天（含发送当天）`);
console.log(`  试用期           ${r.probationMonths}个月`);
console.log(`  联系人           ${r.contact} / ${r.contactPhone}`);
