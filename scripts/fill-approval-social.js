// 社招录用审批（链路一B）· 通用执行脚本
//
// 用法:
//   node fill-approval-social.js <候选人配置.json> [--send]
//
//   不带 --send：填完 + 校验 + 截图，停下等 Neil 确认（默认，不提交）
//   带 --send  ：校验通过后直接提交
//
// ⚠⚠ 填写顺序是硬约束，见下方 step1..step12 的调用序列。
//   顺序错了表单不会报错，但会跑出残缺数据（详见 skill 的 pitfalls）。
//   本脚本把顺序固化在代码里，并在关键步骤做自检，违反即中止。
//
// 配置字段（见同目录 people-social.example.json）:
//   name          候选人姓名（用于卡片匹配）
//   jobKeyword    应聘职位关键字（同名多卡时用于区分）
//   position      企业岗位名（对应 skill config.js 的 social.jobDeptMap 的 key）
//   onboardDate   入职日期  YYYY/MM/DD
//   probationMonths  试用期月数（销售 6 / 其他 3）
//   fullAmount    转正后月收入满额
//   payKey        薪酬结构 key：default | sales | brandMarketing
//   subject       合同主体（默认 福州誉龙）
//   reportAddress 报到地址（默认福州）
//   hireType      录用类型（默认 首次录用）
//   deptOverride  入职部门（不填则用 jobDeptMap 的 dept）
//   bossOverride  汇报对象姓名（不填则用 jobDeptMap 的 leader）

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

// 脚本可能放在两处（skill 的 scripts/ 或工作区），路径自适应：
//   - skill 内：__dirname = <skill>/scripts，工作区 = ../../录用意向书（按 HIRE_WORKSPACE）
//   - 工作区  ：__dirname = <workspace>
// 无论放哪，配置文件都从「当前工作目录」或脚本同级找。
const SKILL = process.env.HIRE_SKILL_DIR || path.resolve(__dirname, '..');
const WORK = process.env.HIRE_WORKSPACE || 'D:\\AI-Workspace\\录用意向书';
const LOG = path.join(WORK, 'logs', 'social-approval.log');

let config, local;
try {
  config = require(path.join(SKILL, 'config.js'));
  local = (() => { try { return require(path.join(SKILL, 'config.local.js')); } catch (e) { return {}; } })();
} catch (e) {
  console.error('!! 读不到 config.js（SKILL=' + SKILL + '）: ' + e.message);
  process.exit(1);
}

const CDP = 'http://127.0.0.1:9333';

function log(s) {
  console.log(s);
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, s + '\n');
  } catch (e) { /* 日志失败不影响主流程 */ }
}

function die(msg) {
  log('!! 中止: ' + msg);
  process.exitCode = 1;
  throw new Error(msg);
}

// ── 薪酬比例 ────────────────────────────────────────────────
const PAY = {
  default:        { full: [80, 5, 15], prob: [80, 5, 0] },
  sales:          { full: [95, 5, 0],  prob: [95, 5, 0] },
  brandMarketing: { full: [95, 5, 0],  prob: [95, 5, 0] },
};

function splitPay(amount, ratios) {
  // 按比例拆分，转正后满额为基准；返回 {basic, secret, perf}
  const total = Number(amount);
  if (!total || total <= 0) die('满额金额无效: ' + amount);
  const r = ratios;
  const basic = Math.round(total * r[0] / 100);
  const secret = Math.round(total * r[1] / 100);
  const perf = Math.round(total * r[2] / 100);
  return { basic: String(basic), secret: String(secret), perf: String(perf), sum: basic + secret + perf };
}

function addMonths(dateStr, months) {
  const m = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) die('入职日期格式应为 YYYY/MM/DD: ' + dateStr);
  let y = Number(m[1]), mo = Number(m[2]) + months, d = Number(m[3]);
  y += Math.floor((mo - 1) / 12);
  mo = ((mo - 1) % 12 + 12) % 12 + 1;
  const pad = n => String(n).padStart(2, '0');
  return y + '/' + pad(mo) + '/' + pad(d);
}

// ── 主流程 ──────────────────────────────────────────────────
(async () => {
  const cfgPath = process.argv[2];
  const SEND = process.argv.includes('--send');
  if (!cfgPath) {
    console.error('用法: node fill-approval-social.js <候选人配置.json> [--send]');
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

  // 映射：岗位 → 部门/职级/序列/Leader
  const map = config.social.jobDeptMap[cfg.position];
  if (!map) die(`岗位不在映射表: ${cfg.position}（按规矩应先问 Neil）`);
  const dept = cfg.deptOverride || map.dept;
  const boss = cfg.bossOverride || map.leader;
  if (!boss || boss.startsWith('<')) die('汇报对象缺失（jobDeptMap.leader 未配置）');

  const payKey = cfg.payKey || map.pay || 'default';
  const ratios = PAY[payKey];
  if (!ratios) die('未知 payKey: ' + payKey);
  const full = splitPay(cfg.fullAmount, ratios.full);
  const prob = splitPay(cfg.fullAmount, ratios.prob);
  const regularDate = addMonths(cfg.onboardDate, cfg.probationMonths);

  log('=== 社招录用审批 ' + cfg.name + ' ===');
  log('  岗位 ' + cfg.position + ' | 部门 ' + dept + ' | 职级 ' + map.rank);
  log('  入职 ' + cfg.onboardDate + ' | 试用期 ' + cfg.probationMonths + '个月 | 转正 ' + regularDate);
  log('  薪酬结构 ' + payKey + ' ' + JSON.stringify(ratios));
  log('  转正后 ' + JSON.stringify(full) + ' | 试用期 ' + JSON.stringify(prob));
  log('  提交模式: ' + (SEND ? '填完即提交' : '填完停下待确认'));

  const b = await chromium.connectOverCDP(CDP);
  const ctx = b.contexts()[0];
  let p = ctx.pages().find(x => x.url().includes('xinrenxinshi'));
  if (!p) p = await ctx.newPage();
  await p.setViewportSize({ width: 1600, height: 1200 });

  // ── 工具函数 ────────────────────────────────────────────
  const readItem = (label) => p.evaluate((lb) => {
    for (const it of document.querySelectorAll('.el-form-item')) {
      const ls = [...new Set([...it.querySelectorAll('.el-form-item__label, label, [class*="label"]')].map(l => (l.innerText || '').trim()))];
      if (!ls.length || !ls[0].replace(/[:：*\s]/g, '').includes(lb)) continue;
      const ins = [...it.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 10);
      return { vals: ins.map(i => i.value), text: (it.innerText || '').replace(/\n+/g, ' | ').trim().slice(0, 140) };
    }
    return null;
  }, label);

  const clickInput = (label) => p.evaluate((lb) => {
    for (const it of document.querySelectorAll('.el-form-item')) {
      const ls = [...new Set([...it.querySelectorAll('.el-form-item__label, label, [class*="label"]')].map(l => (l.innerText || '').trim()))];
      if (!ls.length || !ls[0].replace(/[:：*\s]/g, '').includes(lb)) continue;
      const ins = [...it.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 10);
      if (!ins.length) return null;
      ins[0].scrollIntoView({ block: 'center' });
      const r = ins[0].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return null;
  }, label);

  const fillDate = async (label, val) => {
    const pos = await clickInput(label);
    if (!pos) die(label + ' 无可见 input');
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(450);
    await p.keyboard.press('Control+A');
    await p.keyboard.type(val, { delay: 85 });
    await p.waitForTimeout(500);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(900);
    const cur = await readItem(label);
    log('  ' + label + ' = ' + JSON.stringify(cur && cur.vals));
    if (!((cur && cur.vals || [])[0] || '').includes(val)) die(label + ' 写入失败: ' + JSON.stringify(cur && cur.vals));
  };

  const pickOption = async (label, text) => {
    const pos = await clickInput(label);
    if (!pos) die(label + ' 无可见 input');
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(1800);

    // ⚠ Element UI 的下拉项在 body 末尾的 popper 里，Playwright 的 :visible 过滤
    //   常匹配不到（浮层已渲染但样式判定为不可见）。改用底层坐标点击：
    //   在页面里找文本完全匹配的项 → 取其 boundingRect 中心 → mouse.click。
    // ⚠ Element UI 的下拉项有两个坑：
    //   ① Playwright 的 :visible 过滤常匹配不到（浮层渲染了但样式判定不可见）
    //   ② 动画中间态下 el-select-dropdown__item 的 height = 0
    // 所以：**优先用 Playwright locator 点**（它内部处理动画与可见性），
    //     失败再用底层坐标兜底。
    let clicked = false;
    for (const sel of ['.el-select-dropdown__item', '.el-popper .el-select-dropdown__item', 'li']) {
      const opt = p.locator(sel).filter({ hasText: text }).first();
      if (!(await opt.count())) continue;
      await opt.click({ timeout: 6000 }).catch(async () => {
        const bb = await opt.boundingBox();
        if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2));
      });
      clicked = true;
      break;
    }

    if (!clicked) {
      // 兜底：底层找文本匹配项 → 坐标点击（不过滤 height）
      const hit = await p.evaluate((txt) => {
        const all = [...document.querySelectorAll('li, .el-select-dropdown__item, .el-option, [role="option"], .qj-item')]
          .map(e => {
            const bb = e.getBoundingClientRect();
            return { t: (e.innerText || '').trim(), x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2), w: Math.round(bb.width) };
          })
          .filter(o => o.t === txt && o.w > 8);
        return all[0] || null;
      }, text);
      if (!hit) {
        const items = await p.evaluate(() => {
          const out = [];
          document.querySelectorAll('li, .el-select-dropdown__item, .el-option, [role="option"]').forEach(e => {
            const bb = e.getBoundingClientRect();
            if (bb.width < 8) return;
            out.push((e.innerText || '').replace(/\n+/g, ' ').trim().slice(0, 30));
          });
          return [...new Set(out)].slice(0, 12);
        });
        die(label + ' 无选项 "' + text + '"；可见项: ' + JSON.stringify(items));
      }
      await p.mouse.click(hit.x, hit.y);
    }

    await p.waitForTimeout(1600);
    const cur = await readItem(label);
    log('  ' + label + ' = ' + JSON.stringify(cur && cur.vals));
    if (cur && cur.vals && cur.vals[0] && !cur.vals[0].includes(text)) {
      die(label + ' 选中后值不符: ' + JSON.stringify(cur.vals) + ' 期望含 ' + text);
    }
  };

  // 找到候选人的卡片 → 点「录用审批」→ 返回 resumeId
  const openApproval = async () => {
    await p.goto('https://s.xinrenxinshi.com/recruitment/list', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(7000);
    const box = p.locator('input[placeholder*="姓名"]').first();
    await box.click();
    await box.fill(cfg.name);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(5500);

    const cards = await p.evaluate((kw) => {
      const out = [];
      document.querySelectorAll('.card-item').forEach((c, i) => {
        const tx = c.innerText.replace(/\n+/g, ' | ');
        if (!tx.includes(kw.name)) return;
        out.push({
          idx: i,
          btns: [...c.querySelectorAll('.operation-button')].map(b => b.innerText.trim()),
          txt: tx.slice(0, 200),
        });
      });
      return out;
    }, { name: cfg.name });

    if (!cards.length) die('未找到候选人卡片: ' + cfg.name);
    // 多卡时按应聘职位关键字筛 + 必须有「录用审批」按钮
    let pick = cards.find(c => c.btns.includes('录用审批') && (!cfg.jobKeyword || c.txt.includes(cfg.jobKeyword)));
    if (!pick) pick = cards.find(c => c.btns.includes('录用审批'));
    if (!pick) die('没有带「录用审批」按钮的卡片（可能面试评价未结束）');
    log('  卡片: ' + pick.txt.slice(0, 120));

    // ⚠ 卡片上的「录用审批」按钮 **hover 才显示**，
    //   不 hover 时 getBoundingClientRect 返回 0 → 取不到坐标。
    //   必须先 hover **目标卡片**（按索引定位，不假设是第一张），再取坐标。
    const cardLoc = p.locator('.card-item').nth(pick.idx);
    await cardLoc.hover().catch(() => {});
    await p.waitForTimeout(900);

    const pos = await p.evaluate((idx) => {
      const c = document.querySelectorAll('.card-item')[idx];
      if (!c) return null;
      for (const btn of c.querySelectorAll('.operation-button')) {
        if ((btn.innerText || '').trim() !== '录用审批') continue;
        const r = btn.getBoundingClientRect();
        if (!r.width) return null;
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
      return null;
    }, pick.idx);
    if (!pos) die('取不到「录用审批」按钮坐标（按钮需 hover 才显示）');
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(8000);
    const url = p.url();
    const rid = (url.match(/resumeId=([a-f0-9]+)/) || [])[1];
    if (!rid) die('未跳转到审批详情页: ' + url);
    log('  resumeId = ' + rid);
    return rid;
  };

  const rid = cfg.resumeId || await openApproval();
  if (!cfg.resumeId) {
    // 只有自己找的才回列表核验（resumeId 模式跳过）
  }
  await p.goto('https://s.xinrenxinshi.com/recruitment/approval-detail?resumeId=' + rid,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(8500);
  log('  审批页: ' + rid);

  // ══════════ 按固定顺序执行（顺序即代码结构）══════════

  // ── step1 试用期（必须第一个！触发薪酬区展开两套）──────────
  log('step1 试用期');
  await pickOption('试用期', cfg.probationMonths + '个月');

  // 自检：薪酬槽位必须变成 6 个
  const slotCount = await p.evaluate(() => {
    const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
    if (!item) return 0;
    return [...item.querySelectorAll('input')].filter(i => i.placeholder === '请填写').length;
  });
  log('  薪酬槽位数 = ' + slotCount);
  if (slotCount !== 6) die(`薪酬区未展开成 6 项（实际 ${slotCount}）——试用期没选上？`);

  // ── step2 入职岗位 ─────────────────────────────────────
  log('step2 入职岗位');
  {
    const pos = await clickInput('入职岗位');
    if (!pos) die('入职岗位 无可见 input');
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(2300);
    // 岗位树：分类 → 岗位。分类按岗位名推断所在序列
    const cat = map.seq && map.seq.includes('营销') ? '营销'
      : map.seq && map.seq.includes('技术') ? '技术'
      : map.seq && map.seq.includes('职能') ? '职能' : '管理';
    const c = p.locator('.el-popper:visible').getByText(cat, { exact: true }).first();
    if (await c.count()) {
      await c.scrollIntoViewIfNeeded().catch(() => {});
      await c.click({ timeout: 8000 }).catch(async () => { const bb = await c.boundingBox(); if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)); });
      await p.waitForTimeout(2000);
    }
    const t = p.locator('.el-popper:visible').getByText(cfg.position, { exact: true }).first();
    if (!(await t.count())) die('岗位树里找不到: ' + cfg.position);
    await t.scrollIntoViewIfNeeded().catch(() => {});
    await t.click({ timeout: 8000 }).catch(async () => { const bb = await t.boundingBox(); if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)); });
    await p.waitForTimeout(2400);
    const cur = await readItem('入职岗位');
    log('  入职岗位 = ' + JSON.stringify(cur && cur.vals));
    if (!((cur && cur.vals || [])[0] || '').includes(cfg.position)) die('岗位未选中');
  }

  // ── step3 职级 ─────────────────────────────────────────
  log('step3 职级');
  {
    const pos = await clickInput('职级');
    if (!pos) die('职级 无可见 input');
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(2000);
    const seq = p.locator('.el-popper:visible').getByText(map.seq, { exact: true }).first();
    if (await seq.count()) {
      await seq.scrollIntoViewIfNeeded().catch(() => {});
      await seq.click({ timeout: 8000 }).catch(async () => { const bb = await seq.boundingBox(); if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)); });
      await p.waitForTimeout(2000);
    }
    const rk = p.locator('.el-popper:visible').getByText(map.rank, { exact: true }).first();
    if (!(await rk.count())) die('职级下拉里找不到: ' + map.rank + '（序列 ' + map.seq + '）');
    await rk.scrollIntoViewIfNeeded().catch(() => {});
    await rk.click({ timeout: 8000 }).catch(async () => { const bb = await rk.boundingBox(); if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)); });
    await p.waitForTimeout(2400);
    const cur = await readItem('职级');
    log('  职级 = ' + JSON.stringify(cur && cur.vals));
    if (!((cur && cur.vals || [])[0] || '').includes(map.rank)) die('职级未选中');
  }

  // ── step4 日期 ─────────────────────────────────────────
  log('step4 日期');
  await fillDate('入职日期', cfg.onboardDate);
  await fillDate('转正日期', regularDate);

  // ── step5 合同主体 ─────────────────────────────────────
  log('step5 合同主体');
  await pickOption('合同主体', cfg.subject || '福州誉龙智能科技有限公司');

  // ── step6 枚举 ─────────────────────────────────────────
  log('step6 枚举');
  await pickOption('录用类型', cfg.hireType || '首次录用');
  await pickOption('报到地址', cfg.reportAddress || '福建省福州市鼓楼区火炬高新技术创业园1号楼');

  // ── step7 汇报对象（联想随机，必须重试）─────────────────
  log('step7 汇报对象');
  {
    const key = boss.split('(')[0];  // 用姓/英文名片段搜索
    let ok = false;
    for (let att = 0; att < 5 && !ok; att++) {
      const bp = await clickInput('汇报对象');
      if (!bp) break;
      await p.mouse.click(bp.x, bp.y);
      await p.waitForTimeout(1200);
      await p.keyboard.press('Control+A');
      await p.keyboard.type(key, { delay: 150 });
      await p.waitForTimeout(2600);
      const cand = p.locator('.el-popper:visible').getByText(new RegExp(boss.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).first();
      if (await cand.count()) {
        await cand.scrollIntoViewIfNeeded().catch(() => {});
        await cand.click({ timeout: 6000 }).catch(async () => { const bb = await cand.boundingBox(); if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)); });
        await p.waitForTimeout(1900);
        const cur = await readItem('汇报对象');
        const v = JSON.stringify(cur && cur.vals || '');
        log('  第' + (att + 1) + '次 -> ' + v);
        if (v.includes(boss.split('(')[0].trim())) ok = true;
        else { await p.keyboard.press('Escape'); await p.waitForTimeout(900); }
      } else {
        log('  第' + (att + 1) + '次无候选');
        await p.keyboard.press('Escape');
        await p.waitForTimeout(900);
      }
    }
    if (!ok) die('汇报对象未选中（联想 5 次都失败）');
  }

  // ── step8 工作城市 ─────────────────────────────────────
  log('step8 工作城市');
  {
    const prov = cfg.cityProvince || '福建省';
    const city = cfg.city || '福州市';
    let ok = false;
    for (let att = 0; att < 4 && !ok; att++) {
      const wc = await clickInput('工作城市');
      if (!wc) break;
      await p.mouse.click(wc.x, wc.y);
      await p.waitForTimeout(2100);
      const pv = p.locator('.select-world-city:visible').getByText(prov, { exact: true }).first();
      if (await pv.count()) {
        await pv.scrollIntoViewIfNeeded().catch(() => {});
        await pv.click({ timeout: 8000 }).catch(async () => { const bb = await pv.boundingBox(); if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)); });
        await p.waitForTimeout(1900);
      }
      const ct = p.locator('.city-list-content:visible, .select-world-city:visible').getByText(city, { exact: true }).first();
      if (await ct.count()) {
        await ct.scrollIntoViewIfNeeded().catch(() => {});
        await ct.click({ timeout: 8000 }).catch(async () => { const bb = await ct.boundingBox(); if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)); });
        await p.waitForTimeout(1700);
      }
      const cur = await readItem('工作城市');
      const v = JSON.stringify(cur && cur.vals || '');
      log('  第' + (att + 1) + '次 -> ' + v);
      if (v.includes(city)) ok = true;
      else { await p.keyboard.press('Escape'); await p.waitForTimeout(900); }
    }
    if (!ok) die('工作城市未选中');
  }

  // ── step9 薪酬（JS 赋值，键盘输入无效）──────────────────
  log('step9 薪酬');
  {
    const MAP = {
      '试用期基本工资': prob.basic, '转正后基本工资': full.basic,
      '试用期保密津贴': prob.secret, '转正后保密津贴': full.secret,
      '试用期绩效工资': prob.perf, '转正后绩效工资': full.perf,
    };
    for (const [k, v] of Object.entries(MAP)) {
      const ok = await p.evaluate(([ctx, val]) => {
        const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
        if (!item) return false;
        const inp = [...item.querySelectorAll('input')].find(i => {
          let n = i, c = '';
          for (let k2 = 0; k2 < 8 && n; k2++) { n = n.parentElement; if (!n) break;
            const t = (n.innerText || '').replace(/\n+/g, ' ').trim();
            if (t && t.length < 70) { c = t.replace(/[：:]/g, ''); break; } }
          return c === ctx;
        });
        if (!inp) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, val);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inp.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }, [k, v]);
      await p.waitForTimeout(650);
      if (!ok) die('薪酬字段未找到: ' + k);
      log('  ' + k + ' = ' + v);
    }
    await p.waitForTimeout(1400);
    // 自检：合计必须等于预期
    const sal = await p.evaluate(() => {
      const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
      if (!item) return null;
      const o = {};
      [...item.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 10).forEach(i => {
        let n = i, c = '';
        for (let k = 0; k < 8 && n; k++) { n = n.parentElement; if (!n) break;
          const t = (n.innerText || '').replace(/\n+/g, ' ').trim();
          if (t && t.length < 70) { c = t.replace(/[：:]/g, ''); break; } }
        o[c] = i.value;
      });
      return o;
    });
    log('  合计: 试用期 ' + sal['试用期工资合计'] + ' / 转正后 ' + sal['转正后工资合计']);
    if (Number(sal['试用期工资合计']) !== prob.sum) die('试用期合计不符: ' + sal['试用期工资合计'] + ' ≠ ' + prob.sum);
    if (Number(sal['转正后工资合计']) !== full.sum) die('转正后合计不符: ' + sal['转正后工资合计'] + ' ≠ ' + full.sum);
  }

  // ── step10 入职部门（必须最后填，否则被联动覆盖）─────────
  log('step10 入职部门');
  {
    const dp = await clickInput('入职部门');
    if (!dp) die('入职部门 无可见 input');
    await p.mouse.click(dp.x, dp.y);
    await p.waitForTimeout(2600);
    // 按 fullPath 逐级展开
    // ⚠ 树的节点文字可能与 fullPath 段不完全一致
    //   （例：fullPath 段 "Implementation(远程实施部)"，树上可能显示为 "Implementation(远程实施部)"，
    //     但也可能带前后空格或不同括号）→ 用「前缀包含」匹配，取最短的那个候选。
    const segs = (map.fullPath || '').split('/');
    for (let i = 0; i < segs.length - 1; i++) {
      const kw = segs[i];
      // 用括号前的英文名做更宽松的匹配键
      const key = (kw.match(/^([^(（]+)/) || [null, kw])[1].trim() || kw;
      const n = await p.evaluate((keys) => {
        const d = document.querySelector('.dept-dropdown'); if (!d) return [];
        const out = [];
        d.querySelectorAll('.el-tree-node__content').forEach(x => {
          const bb = x.getBoundingClientRect(); if (bb.width < 10) return;
          const txt = (x.innerText || '');
          if (!keys.some(k => txt.includes(k))) return;
          const ic = x.querySelector('.el-tree-node__expand-icon');
          const ib = ic ? ic.getBoundingClientRect() : null;
          if (ib && ib.width > 4) out.push({ x: Math.round(ib.x + ib.width / 2), y: Math.round(ib.y + ib.height / 2), txt: txt.slice(0, 40) });
        });
        // 取文本最短的候选（最贴近该级节点）
        out.sort((a, b2) => a.txt.length - b2.txt.length);
        return out;
      }, [kw, key]);
      if (!n.length) die('部门树里找不到可展开节点: ' + kw);
      await p.mouse.click(n[0].x, n[0].y);
      await p.waitForTimeout(2300);
      log('  展开 ' + n[0].txt);
    }
    // 点叶子节点文字（同样宽松匹配）
    const leaf = segs[segs.length - 1];
    const labs = await p.evaluate((keys) => {
      const d = document.querySelector('.dept-dropdown'); if (!d) return [];
      const out = [];
      d.querySelectorAll('.el-tree-node__label, .el-tree-node__content span').forEach(x => {
        const t = (x.textContent || '').trim();
        if (!keys.some(k => t === k || t.includes(k))) return;
        const bb = x.getBoundingClientRect(); if (bb.width < 10) return;
        out.push({ x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2), t });
      });
      out.sort((a, b2) => a.t.length - b2.t.length);
      return out;
    }, [leaf]);
    if (!labs.length) die('部门树里找不到叶子节点: ' + leaf);
    await p.mouse.click(labs[0].x, labs[0].y);
    await p.waitForTimeout(2500);
    log('  点叶子: ' + labs[0].t);
    const cur = await readItem('入职部门');
    log('  入职部门 = ' + JSON.stringify(cur && cur.vals));
    if (!((cur && cur.vals || [])[0] || '').includes(dept)) die('部门未选中');
    // 判据：出现编制信息 = 真选中而非打字
    if (!/编制|占编/.test(cur.text || '')) die('部门下方无编制信息 —— 没真选中（可能只是输入了文本）');
  }

  // ── step11 blur（el-select 必须 blur 才写进 model）────────
  log('step11 blur');
  {
    const hr = await clickInput('HRBP');
    if (hr) { await p.mouse.click(hr.x, hr.y); await p.waitForTimeout(400); await p.keyboard.press('Tab'); await p.waitForTimeout(1400); }
  }

  // ── step12 校验 → 截图 →（可选）提交 ─────────────────────
  log('step12 校验');
  const snap = {};
  for (const lb of ['入职日期', '试用期', '转正日期', '合同主体', '入职部门', '入职岗位', '职级', 'HRBP', '汇报对象', '管理形式', '工作城市', '录用类型', '报到地址', '入职联系人', '联系人电话']) {
    const c = await readItem(lb);
    snap[lb] = c ? c.vals : null;
    log('  ' + lb + ' = ' + JSON.stringify(c && c.vals));
  }
  const salFinal = await p.evaluate(() => {
    const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
    if (!item) return null;
    const o = {};
    [...item.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 10).forEach(i => {
      let n = i, c = '';
      for (let k = 0; k < 8 && n; k++) { n = n.parentElement; if (!n) break;
        const t = (n.innerText || '').replace(/\n+/g, ' ').trim();
        if (t && t.length < 70) { c = t.replace(/[：:]/g, ''); break; } }
      o[c] = i.value;
    });
    return o;
  });
  log('  薪酬: ' + JSON.stringify(salFinal));

  // 关键项校验
  const bad = [];
  const chk = {
    '入职日期': cfg.onboardDate, '试用期': cfg.probationMonths + '个月',
    '转正日期': regularDate, '入职岗位': cfg.position, '职级': map.rank,
    '入职部门': dept, '汇报对象': boss.split('(')[0].trim(),
  };
  for (const [k, v] of Object.entries(chk)) {
    const cur = JSON.stringify(snap[k] || '');
    if (!cur.includes(v)) bad.push(k + '=' + cur + ' 期望含 ' + v);
  }
  if (bad.length) die('校验不通过: ' + bad.join(' | '));
  log('  ✓ 全部校验通过');

  // 截图（分段）
  const shot = path.join(WORK, 'logs', 'review-' + cfg.name + '-' + Date.now());
  for (const [anchor, name] of [['入职信息', 'hire'], ['薪酬信息', 'pay']]) {
    await p.evaluate((a) => {
      const t = [...document.querySelectorAll('*')].find(e => (e.innerText || '').trim() === a && e.children.length === 0);
      if (t) t.scrollIntoView({ block: 'start' });
    }, anchor);
    await p.waitForTimeout(1200);
    await p.mouse.move(10, 300);
    await p.waitForTimeout(500);
    await p.screenshot({ path: shot + '-' + name + '.png', timeout: 18000 }).catch(() => {});
  }
  log('  截图: ' + shot + '-*.png');

  if (!SEND) {
    await b.close();
    log('【已填完，未提交】等待 Neil 确认。确认后用同一命令加 --send 重跑（会重新填一遍）');
    return;
  }

  // ── 提交：页脚「确定」→ 弹窗「提交审批」→ 弹窗内「确定」──
  log('提交');
  const okBtn = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, .el-button, a').forEach(e => {
      if (e.closest('.el-dialog, .el-message-box')) return;
      const t = (e.innerText || e.textContent || '').replace(/\n+/g, ' ').trim();
      if (t !== '确定') return;
      const bb = e.getBoundingClientRect();
      if (bb.width < 10 || bb.height < 10) return;
      out.push({ x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) });
    });
    return out;
  });
  if (!okBtn.length) die('找不到页脚「确定」');
  await p.mouse.click(okBtn[okBtn.length - 1].x, okBtn[okBtn.length - 1].y);
  await p.waitForTimeout(5500);

  const dlg = p.locator('.el-dialog:visible, .qj-dialog:visible, .el-message-box:visible').first();
  if (await dlg.count()) {
    log('  弹窗: ' + (await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 200));
    const inOk = dlg.getByText('确定', { exact: true }).last();
    if (await inOk.count()) {
      await inOk.click({ timeout: 8000 }).catch(async () => {
        const bb = await inOk.boundingBox();
        if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2));
      });
    } else {
      const pos = await p.evaluate(() => {
        const d = document.querySelector('.el-dialog, .qj-dialog, .el-message-box');
        if (!d) return null;
        for (const e of d.querySelectorAll('*')) {
          if (e.children.length > 0) continue;
          if ((e.textContent || '').trim() !== '确定') continue;
          const bb = e.getBoundingClientRect();
          if (bb.width < 8) return null;
          return { x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) };
        }
        return null;
      });
      if (pos) await p.mouse.click(pos.x, pos.y);
    }
    await p.waitForTimeout(10000);
  } else {
    log('  未出现弹窗');
    await p.waitForTimeout(5000);
  }

  // 回列表核验
  await p.goto('https://s.xinrenxinshi.com/recruitment/list', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(7000);
  const box = p.locator('input[placeholder*="姓名"]').first();
  await box.click();
  await box.fill(cfg.name);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(5500);
  const cards = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.card-item').forEach(c => {
      const tx = c.innerText.replace(/\n+/g, ' | ');
      out.push({ btns: [...c.querySelectorAll('.operation-button')].map(b => b.innerText.trim()), txt: tx.slice(0, 200) });
    });
    return out;
  });
  log('=== 卡片状态 ===');
  cards.forEach(c => { log('  按钮: ' + JSON.stringify(c.btns)); log('  ' + c.txt); });

  await b.close();
  log('【提交完成】');
})().catch(e => {
  if (!process.exitCode) log('ERR: ' + e.message);
  process.exit(process.exitCode || 1);
});
