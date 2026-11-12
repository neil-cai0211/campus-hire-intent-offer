// 录用意向书模板槽位分析器
// 
// 用法:
//   node parse-slots.js <dump文件> [输出文件]
// 
// 输入: dump-template.ps1 产出的 template-dump.txt 结构快照
// 输出: 每个单元格里的「下划线连续段」清单（起始 idx / 长度 / 当前文本）
// 
// 用途: 生成 config.js 里 templates.<key>.fills 的填位表
//       —— 槽位位置必须精确，手抄容易错，机器解析最稳

const fs = require('fs');

const dumpPath = process.argv[2];
const outPath = process.argv[3] || 'D:/AI-Workspace/liuyi-work/slots.json';

if (!dumpPath) {
  console.error('用法: node parse-slots.js <dump文件> [输出文件]');
  process.exit(1);
}

const text = fs.readFileSync(dumpPath, 'utf8');

// 拆成 "--- RXCY ---" 段落
// 注意：dump 里一个单元格的字符全部挤在同一行，格式为 [0]'a' [1]U'b' [2]'c'
// 关键细节：普通字符写作 [5] '年'（] 后有空格），下划线字符写作 [1]U'2'（无空格），
//          所以正则必须允许可选空白，否则普通字符会被跳过、连续段就串错。
const lines = text.split(/\r?\n/);
const cells = {};
let cur = null;
const cellRe = /^--- (R\d+C\d+) ---$/;
// 全局匹配字符条目：[idx] 可选空白 可选'U' 引号内容
const charRe = /\[(\d+)\]\s*(U?)'((?:[^'\\]|\\.)*)'/g;
// 单元格结束标记：Word 的单元格/段落分隔符，可能带换行（如 '\n\x07'、'\r\x07'）
//
// ⚠ 关键：标记不是「整个字符条目」，而是「某个字符条目里混进来的控制符」。
//   例如 R3C2 的最后一个条目是 '\n\x07' —— 它其实是一个下划线空格
//   加上结束标记。所以不能整条丢弃，只能把控制符剥掉、保留那个空格。
//   直接丢弃整条会让槽位长度少 1（R3C2 真实是 19 个下划线空格，不是 18）。
const CTRL = /[\r\n\x07\x0b]/g;

for (const line of lines) {
  const m = line.match(cellRe);
  if (m) { cur = m[1]; cells[cur] = []; continue; }
  if (!cur) continue;
  charRe.lastIndex = 0;
  let c;
  while ((c = charRe.exec(line)) !== null) {
    // 剥掉混进字符里的结束标记控制符，保留实际字符（空格也是可填位）
    const ch = c[3].replace(CTRL, '');
    cells[cur].push({ idx: parseInt(c[1], 10), u: c[2] === 'U', ch });
  }
}

// 找每格里的下划线连续段
const slots = {};
for (const [cell, chars] of Object.entries(cells)) {
  const segs = [];
  let s = null;
  for (const c of chars) {
    if (c.u) {
      if (!s) s = { start: c.idx, len: 0, text: '' };
      s.len++;
      s.text += c.ch;
    } else if (s) {
      segs.push(s); s = null;
    }
  }
  if (s) segs.push(s);
  if (segs.length) slots[cell] = segs;
}

// 输出：每格一行，列出段
const result = {};
for (const [cell, segs] of Object.entries(slots)) {
  result[cell] = segs.map(g => ({
    start: g.start,
    len: g.len,
    // 段内「有实际文字」的部分（数字/字母/汉字），空格是待填空位
    value: g.text.replace(/ /g, ''),
    raw: g.text.length > 30 ? g.text.slice(0, 30) + '…' : g.text,
  }));
}

// ⚠ 记下 dump 的 SIZE/MTIME ⇒ verify-slots.js 能校验「dump 与 slots 是否同版本」。
//   不同版本时 slots 的下标与 config 不配套，校验结果全是假阳性（2026-11-12 踩过）。
const dumpTxt = fs.existsSync(dumpPath) ? fs.readFileSync(dumpPath, 'utf8') : '';
const sizeM = dumpTxt.match(/SIZE\s*:\s*(\d+)/);
const mtimeM = dumpTxt.match(/MTIME\s*:\s*(\S+)/);
if (sizeM) result.__dumpSize = Number(sizeM[1]);
if (mtimeM) result.__dumpMtime = mtimeM[1];

fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf8');

console.log('=== 下划线槽位（' + Object.keys(result).filter(k => !k.startsWith('__')).length + ' 个单元格）===');
for (const [cell, segs] of Object.entries(result)) {
  if (cell.startsWith('__')) continue;   // __dumpSize / __dumpMtime 是元数据，不是单元格
  const desc = segs.map(g => {
    const v = g.value === '' ? '(空)' : g.value;
    return `[${g.start}+${g.len}]${v}`;
  }).join(' ');
  console.log('  ' + cell.padEnd(6) + desc);
}
console.log('\n已写入: ' + outPath);
