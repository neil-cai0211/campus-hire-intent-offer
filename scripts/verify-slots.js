// 模板槽位与 config.js 下标表交叉校验
//
// 用法:
//   node verify-slots.js
//
// 作用: 校验 config.js 里 templates.<key>.fills 的每一条填位
//       是否与模板实际下划线槽位吻合（start/len 落在真正的槽位上）
//       模板被公司更新后，槽位会漂移 —— 这个脚本能第一时间发现，
//       避免静默填错位置（发出去的意向书内容错位但流程不报错）
//
// 依赖: 先跑 dump-template.ps1 生成 dump，再跑 parse-slots.js 生成 slots.json

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const WORK = process.env.HIRE_WORKSPACE || 'D:\\AI-Workspace\\录用意向书';
const SLOTS_DIR = 'D:\\AI-Workspace\\liuyi-work';

const config = require(path.join(SKILL_DIR, 'config.js'));

const KEY_FILE = {
  tech: 'slots-tech.json',
  sales: 'slots-sales.json',
  brand: 'slots-brand.json',
  other: 'slots-other.json',
  expatriate: 'slots-expat.json',
};

let problems = 0;
let checked = 0;

for (const [key, file] of Object.entries(KEY_FILE)) {
  const tpl = config.templates[key];
  if (!tpl) { console.log('⚠ config 无模板: ' + key); continue; }
  const fp = path.join(SLOTS_DIR, file);
  if (!fs.existsSync(fp)) {
    console.log('⏭ ' + key.padEnd(10) + ' 无槽位快照（' + file + '），跳过');
    continue;
  }
  const slots = JSON.parse(fs.readFileSync(fp, 'utf8'));

  // 指纹校验
  const stamp = fs.existsSync(path.join(SLOTS_DIR, 'dump-' + (key === 'expatriate' ? 'expat' : key) + '.txt'))
    ? fs.readFileSync(path.join(SLOTS_DIR, 'dump-' + (key === 'expatriate' ? 'expat' : key) + '.txt'), 'utf8')
    : '';
  const sizeM = stamp.match(/SIZE\s*:\s*(\d+)/);
  if (sizeM && tpl.fingerprint && Number(sizeM[1]) !== tpl.fingerprint.size) {
    console.log('❌ ' + key.padEnd(10) + ' 模板 Size 不符: dump=' + sizeM[1] + ' config=' + tpl.fingerprint.size);
    problems++;
  }

  const fills = tpl.fills || [];
  if (!fills.length) {
    console.log('⏭ ' + key.padEnd(10) + ' 未定义 fills（analyzed=' + (tpl.analyzed !== false) + '），跳过');
    continue;
  }

  const errs = [];
  for (const f of fills) {
    checked++;
    // config 的 cell 写作 '行,列'，槽位快照用 'R行C列'
    const cellKey = 'R' + f.cell.replace(',', 'C');
    const segs = slots[cellKey];
    if (!segs) { errs.push(f.field + ' @' + f.cell + ' 该格无下划线槽位'); continue; }
    // 填位应覆盖某段槽位的「值部分」（槽位尾部的空格是留白，不必填满）
    const hit = segs.find(g => f.idx >= g.start && f.idx < g.start + g.len);
    if (!hit) {
      errs.push(f.field + ' @' + f.cell + ' idx=' + f.idx + ' 不在任何槽位内（槽位: ' +
        segs.map(g => g.start + '+' + g.len).join(',') + '）');
      continue;
    }
    if (f.len > hit.len) {
      errs.push(f.field + ' @' + f.cell + ' len=' + f.len + ' 超过槽位长度 ' + hit.len);
    }
  }
  if (errs.length) {
    console.log('❌ ' + key.padEnd(10) + ' ' + errs.length + ' 处不一致');
    errs.forEach(e => console.log('     - ' + e));
    problems += errs.length;
  } else {
    console.log('✅ ' + key.padEnd(10) + ' ' + fills.length + ' 条填位全部对齐');
  }
}

console.log('\n共校验 ' + checked + ' 条填位，' + problems + ' 处问题');
process.exit(problems ? 1 : 0);
