// 模板槽位与 config.js 下标表交叉校验
//
// 用法:
//   node verify-slots.js
//
// 作用: 校验 config.js 里 templates.<key>.fills 的每一条填位
//       是否与模板实际下划线槽位吻合（idx/len 落在真正的槽位上，且长度匹配）
//       模板被公司更新后，槽位会漂移 —— 这个脚本能第一时间发现，
//       避免静默填错位置（发出去的意向书内容错位但流程不报错）
//
// ⚠⚠ 三条硬规则（2026-11-12 补，都是踩过的坑）：
//
// 1. **长度必须完全相等**，不能只查「超长」。
//    旧版只报 `f.len > hit.len`，于是**槽位缩短**（如日期「日」2位→1位）不报错，
//    而替换会多吃一个字（把后面的「日」吃掉）→ 文件错但流程无报错。
//
// 2. **dump 与 slots 必须同版本**。
//    只改了 slots 没同步 dump（或反之）⇒ 校验结果毫无意义。
//    本脚本从 slots 与 dump 各自读出 SIZE/MTIME 交叉比对，不一致直接判失败。
//
// 3. **指纹不符 = 立即失败，不继续校验**。
//    模板改了但 dump/slots 还是旧的 ⇒ 下面那些「对齐」全是假阳性。
//
// 依赖: 先跑 dump-template.ps1 生成 dump，再跑 parse-slots.js 生成 slots.json
//       （两者必须来自同一次 dump）

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const SLOTS_DIR = process.env.HIRE_SLOTS_DIR || 'D:\\AI-Workspace\\liuyi-work';

const config = require(path.join(SKILL_DIR, 'config.js'));

const KEY_FILE = {
  tech: 'slots-tech.json',
  sales: 'slots-sales.json',
  brand: 'slots-brand.json',
  other: 'slots-other.json',
  expatriate: 'slots-expat.json',
};
const DUMP_FILE = {
  tech: 'dump-tech.txt',
  sales: 'dump-sales.txt',
  brand: 'dump-brand.txt',
  other: 'dump-other.txt',
  expatriate: 'dump-expat.txt',
};

let problems = 0;
let checked = 0;

for (const [key, file] of Object.entries(KEY_FILE)) {
  const tpl = config.templates[key];
  if (!tpl) { console.log('⚠ config 无模板: ' + key); continue; }
  const fp = path.join(SLOTS_DIR, file);
  const dp = path.join(SLOTS_DIR, DUMP_FILE[key]);
  if (!fs.existsSync(fp) || !fs.existsSync(dp)) {
    console.log('⏭ ' + key.padEnd(10) + ' 缺槽位快照或 dump（' + file + ' / ' + DUMP_FILE[key] + '），跳过');
    continue;
  }
  const slots = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const stamp = fs.readFileSync(dp, 'utf8');

  // ---- 规则 3：指纹不符 ⇒ 立即失败，不继续校验 ----
  const sizeM = stamp.match(/SIZE\s*:\s*(\d+)/);
  const mtimeM = stamp.match(/MTIME\s*:\s*(\S+)/);
  const dumpSize = sizeM ? Number(sizeM[1]) : null;
  const dumpMtime = mtimeM ? mtimeM[1] : null;
  if (tpl.fingerprint && dumpSize !== null && dumpSize !== tpl.fingerprint.size) {
    console.log('❌ ' + key.padEnd(10) + ' 模板 Size 不符: dump=' + dumpSize + ' config=' + tpl.fingerprint.size +
      '  ⇒ 模板已改版，必须重跑 dump-template.ps1 + parse-slots.js 后再校验');
    problems++;
    continue;
  }
  if (tpl.fingerprint && dumpMtime && String(tpl.fingerprint.mtime) !== dumpMtime) {
    console.log('❌ ' + key.padEnd(10) + ' 模板 Mtime 不符: dump=' + dumpMtime + ' config=' + tpl.fingerprint.mtime +
      '  ⇒ 必须重跑 dump-template.ps1 + parse-slots.js');
    problems++;
    continue;
  }

  // ---- 规则 2：dump 与 slots 必须同版本 ----
  // slots 是 parse-slots.js 从 dump 解析出来的，parse 会把 dump 的 SIZE 写进 slots。
  const slotsSize = slots.__dumpSize !== undefined ? slots.__dumpSize : null;
  if (slotsSize !== null && dumpSize !== null && slotsSize !== dumpSize) {
    console.log('❌ ' + key.padEnd(10) + ' dump 与 slots 不是同一版本（dump=' + dumpSize + ' slots=' + slotsSize +
      '）⇒ 两份文件必须来自同一次 dump');
    problems++;
    continue;
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
    // ---- 规则 1：长度校验 ----
    // 两种填位语义：
    //   A. **值部分替换**（tech，走 gen-intent.js）：只替换槽位里的值，
    //      len 必须等于「值部分长度」（trim 掉首尾空格）。
    //      ⚠ 旧版只查「超长」⇒ 槽位缩短时漏报（2026-11-04 tech 模板「日」2位→1位，
    //        旧 len=2 会把后面的「日」字一起吃掉，文件错但流程不报错）。
    //   B. **整段替换**（sales/brand/other/expatriate，走 gen-intent-sales.js）：
    //      连空格一起替换，len 落在「值部分长度 ~ 槽位总长」之间都合法
    //      （例：other 的 R3C2 raw=" 销售线 "，idx8 len5 = 空格+销售线+空格）。
    // strict 标记（config.templates.<key>.strictLen=true）时只接受「值部分长度」，
    //   用于新脚本（gen-intent.js）这类精确替换型。
    const trimmed = (hit.raw !== undefined ? hit.raw : '').trim();
    const valueLen = trimmed.length;
    const slotLen = hit.len;
    const strict = !!tpl.strictLen;
    if (valueLen > 0) {
      if (strict) {
        if (f.len !== valueLen) {
          errs.push(f.field + ' @' + f.cell + ' len=' + f.len + ' ≠ 值部分长度 ' + valueLen +
            '（槽位总长 ' + slotLen + ', raw="' + (hit.raw || '') + '"）' +
            (f.len < valueLen ? ' ⇒ 填少了，槽位尾部会残留模板示例值'
              : ' ⇒ 填多了，会多吃后面的字'));
        }
      } else if (f.len < valueLen || f.len > slotLen) {
        errs.push(f.field + ' @' + f.cell + ' len=' + f.len + ' 超出合法区间 [' +
          valueLen + ', ' + slotLen + ']（raw="' + (hit.raw || '') + '"）');
      }
    }
    if (f.len > slotLen) {
      errs.push(f.field + ' @' + f.cell + ' len=' + f.len + ' 超过槽位总长度 ' + slotLen);
    }
  }
  if (errs.length) {
    console.log('❌ ' + key.padEnd(10) + ' ' + errs.length + ' 处不一致');
    errs.forEach(e => console.log('     - ' + e));
    problems += errs.length;
  } else {
    console.log('✅ ' + key.padEnd(10) + ' ' + fills.length + ' 条填位全部对齐' +
      '（size=' + dumpSize + ', 长度精确匹配）');
  }
}

console.log('\n共校验 ' + checked + ' 条填位，' + problems + ' 处问题');
process.exit(problems ? 1 : 0);
