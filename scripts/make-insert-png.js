// 从录用意向书 PDF 生成高画质插图（邮件用）
// 方案：pdf.js scale=12 渲染（PDF 是矢量，放大不损）→ 派生 3176 宽 JPEG q=90
//   · 分辨率是旧方案(1600)的 2 倍，文字锐利不虚
//   · q=90 对黑白文字无可见压缩伪影
//   · 1792KB，在上传限制 ≤2MB 内
//
// 用法:
//   node make-insert-png.js                  → 全量（读 people.js）
//   node make-insert-png.js 15 16            → 只生成 people.js 里 no=15,16
//   node make-insert-png.js --names "张三-某大学-某岗位" "李四-某大学-某岗位"
//                                          → 按 outName 直接生成（不依赖 people.js）
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const PDFDIR = process.env.HIRE_OUT_DIR || 'D:/AI-Workspace/录用意向书/out';
const DST = process.env.HIRE_PNG_DIR || 'D:/AI-Workspace/录用意向书/out-png';
const OUT_W = 3176;          // 输出宽度
const JPEG_Q = 0.90;        // JPEG 质量
const RENDER_SCALE = 12;    // pdf.js 渲染倍率（矢量，放大不损)

// 解析命令行 → 待生成的 outName 列表
// 优先用 --names（不依赖 people.js，仓库副本也能跑）；否则读 people.js 按 no 过滤
let targets = [];
const argv = process.argv.slice(2);
const nameIdx = argv.indexOf('--names');
if (nameIdx >= 0) {
  targets = argv.slice(nameIdx + 1).filter(Boolean).map(n => ({ outName: n }));
  console.log('按 outName 生成 ' + targets.length + ' 份');
} else {
  let people = [];
  try { people = require('./people.js'); } catch (e) { people = []; }
  const ONLY = argv.filter(a => /^\d+$/.test(a)).map(Number);
  targets = ONLY.length ? people.filter(p => ONLY.includes(p.no)) : people;
  if (!targets.length) {
    console.error('✗ 未指定目标。可用：node make-insert-png.js --names "<outName>" ["<outName>" ...]');
    process.exit(2);
  }
  console.log('共 ' + targets.length + ' 份' + (ONLY.length ? '（no=' + ONLY.join(',') + '）' : ''));
}

(async () => {
  fs.mkdirSync(DST, { recursive: true });
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1800, height: 2600 }, deviceScaleFactor: 1 });
  await p.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script></body></html>');
  await p.waitForFunction(() => !!window.pdfjsLib, { timeout: 25000 });

  for (const person of targets) {
    const pdf = path.join(PDFDIR, `${person.outName}.pdf`);
    if (!fs.existsSync(pdf)) { console.log('⏭  缺 PDF', person.outName); continue; }
    const b64 = fs.readFileSync(pdf).toString('base64');
    const dataUrl = await p.evaluate(async (arg) => {
      const { data, scale, outW, q } = arg;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const bin = atob(data); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const doc = await pdfjsLib.getDocument({ data: arr }).promise;
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale });
      const tmp = document.createElement('canvas');
      tmp.width = vp.width; tmp.height = vp.height;
      await page.render({ canvasContext: tmp.getContext('2d'), viewport: vp }).promise;
      const h = Math.round(tmp.height * outW / tmp.width);
      const c = document.createElement('canvas');
      c.width = outW; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tmp, 0, 0, outW, h);
      return c.toDataURL('image/jpeg', q);
    }, { data: b64, scale: RENDER_SCALE, outW: OUT_W, q: JPEG_Q });

    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const out = path.join(DST, `${person.outName}.jpg`);
    fs.writeFileSync(out, buf);
    const kb = Math.round(buf.length / 1024);
    console.log(`${kb < 2048 ? '✅' : '❌'} ${person.no ?? ''} ${person.outName}  ${OUT_W} 宽  ${kb} KB`);
  }
  await b.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
