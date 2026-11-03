// 一站式：填 offer 表单 → 选模板 → 插图 → 发送
// ⚠ 草稿不保存 ⇒ 必须同一次会话内跑完，中间不能 goto/reload。
// 用法: node offer-onepass-social.js <配置.json> [--send]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const SKILL = process.env.HIRE_SKILL_DIR || (process.env.USERPROFILE || process.env.HOME) + '/.workbuddy/skills/campus-hire-intent-offer';
const local = (() => { try { return require(path.join(SKILL, 'config.local.js')); } catch (e) { return {}; } })();
const CC_NAME = local.ccName || 'HR联系人';
const MAIL_TPL = '正式员工 - 福州';

const CFG = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const DO_SEND = process.argv.includes('--send');
const OUT = process.env.HIRE_OUT_DIR || (process.env.USERPROFILE || process.env.HOME) + '/.workbuddy/tmp/offer-onepass';
const RID = CFG.resumeId;

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = b.contexts()[0];
  let p = ctx.pages().find(x => x.url().includes('xinrenxinshi'));
  if (!p) p = await ctx.newPage();
  await p.setViewportSize({ width: 1600, height: 1400 });
  const log = (...a) => console.log(...a);
  const errors = [];

  // ---------- 加载页面并确保是「表单态」 ----------
  // ⚠⚠ 上一次运行的残留会让页面停在**预览态**（字段 label 变重复、薪酬区收起），
  //   此时所有字段定位都会失效 ⇒ 每次运行都重新加载，并检测残留预览态。
  await p.goto('https://s.xinrenxinshi.com/recruitment/send-offer?resumeId=' + RID, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(9000);
  {
    const st = await p.evaluate(() => {
      const t = document.body.innerText || '';
      const hasPreviewBtn = [...document.querySelectorAll('button, .el-button')].some(b => (b.innerText || '').trim() === '预览offer' && b.getBoundingClientRect().width > 5);
      const hasModify = /修改邮件/.test(t);
      return { hasPreviewBtn, hasModify };
    });
    if (!st.hasPreviewBtn && st.hasModify) {
      log('  页面停在预览态，重载回表单态');
      await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(9000);
    }
  }

  // ---------- 通用定位 ----------
  // ⚠⚠ 这个表单的字段定位必须用「遍历 .el-select → 向上找最近的 .label-name」。
  //   其它两种写法都会出错：
  //   ① 从 label 元素向上找祖先 input ⇒ 会把**别的字段**的 input 一起读进来
  //      （实测岗位被读成「产品运营」）
  //   ② label 文本在预览态会**重复**（"入职岗位：" → "入职岗位 入职岗位："）
  //      ⇒ 精确匹配会 miss，必须先归一化
  const normLabel = (s) => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');
  // 预览态 label 重复 → 归一化后去重（只处理「XX XX」整串重复的情况）
  const dedupLabel = (t) => { const m = t.match(/^(.{1,20}?)\1+$/); return m ? m[1] : t; };

  // locateInput：找**非 select** 的普通 input（如 offer有效期）
  // 策略：找 label 叶子文本 → 向上找祖先里的 input（跳过 .el-select 里的）
  const locateInput = async (label) => p.evaluate((lb) => {
    const norm = s => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');
    const dedup = t => { const m = t.match(/^(.{1,20}?)\1+$/); return m ? m[1] : t; };
    const target = norm(lb);
    for (const e of document.querySelectorAll('div,span,label,p')) {
      const t = norm(e.innerText);
      if (!t || e.children.length > 0) continue;
      if (dedup(t) !== target) continue;
      let node = e;
      for (let k = 0; k < 8 && node; k++) {
        const ins = [...node.querySelectorAll('input,textarea')]
          .filter(i => i.getBoundingClientRect().width > 5 && !i.closest('.el-select'));
        if (ins.length) {
          const inp = ins[0];
          inp.scrollIntoView({ block: 'center' });
          const r = inp.getBoundingClientRect();
          return { x: Math.round(r.x + Math.min(30, r.width / 2)), y: Math.round(r.y + r.height / 2), v: inp.value };
        }
        node = node.parentElement;
      }
    }
    return null;
  }, label);

  const readInput = async (label) => p.evaluate((lb) => {
    const norm = s => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');
    const dedup = t => { const m = t.match(/^(.{1,20}?)\1+$/); return m ? m[1] : t; };
    const target = norm(lb);
    for (const e of document.querySelectorAll('div,span,label,p')) {
      const t = norm(e.innerText);
      if (!t || e.children.length > 0) continue;
      if (dedup(t) !== target) continue;
      let node = e;
      for (let k = 0; k < 8 && node; k++) {
        const ins = [...node.querySelectorAll('input,textarea')]
          .filter(i => i.getBoundingClientRect().width > 5 && !i.closest('.el-select'));
        if (ins.length) return ins.map(i => i.value);
        node = node.parentElement;
      }
    }
    return null;
  }, label);

  // 返回 [{label, ph, v, x, y}]，x/y 是该 select 的 input 中心
  const selectFields = async () => p.evaluate(() => {
    const norm = s => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');
    const dedup = t => { const m = t.match(/^(.{1,20}?)\1+$/); return m ? m[1] : t; };
    const out = [];
    for (const el of document.querySelectorAll('.el-select')) {
      let n = el, label = '';
      for (let k = 0; k < 8 && n; k++) {
        const ln = n.querySelector ? n.querySelector('.label-name') : null;
        if (ln) { label = norm(ln.innerText); break; }
        n = n.parentElement;
      }
      const inp = el.querySelector('input');
      if (!inp) continue;
      const bb = el.getBoundingClientRect();
      if (bb.width <= 5) continue;      // 隐藏的下拉跳过
      inp.scrollIntoView({ block: 'center' });
      const ir = inp.getBoundingClientRect();
      out.push({
        label: dedup(label),
        rawLabel: label,
        ph: inp.placeholder || '',
        v: inp.value,
        x: Math.round(ir.x + Math.min(30, ir.width / 2)),
        y: Math.round(ir.y + ir.height / 2),
      });
    }
    return out;
  });

  const locate = async (label) => {
    const all = await selectFields();
    const target = dedupLabel(normLabel(label));
    const hit = all.find(f => f.label === target) || all.find(f => f.label.includes(target));
    return hit ? { x: hit.x, y: hit.y, ph: hit.ph, v: hit.v } : null;
  };

  const readField = async (label) => {
    const all = await selectFields();
    const target = dedupLabel(normLabel(label));
    const hit = all.find(f => f.label === target) || all.find(f => f.label.includes(target));
    return hit ? [hit.v] : null;
  };

  const visibleOptions = async () => p.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('.el-select-dropdown__item')) {
      const bb = e.getBoundingClientRect();
      const t = (e.innerText || '').trim();
      if (!t) continue;
      // ⚠ 过滤条件要**放宽**：下拉打开时选项可能在视口外（y 超出范围），
      //   但仍可点击（Playwright 会自动滚动）。只按宽高判定可见性。
      if (bb.width <= 4 || bb.height <= 4) continue;
      out.push({ t: t.slice(0, 60), x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) });
    }
    return out;
  });

  // pickOption：若字段**已有值**且与期望一致 → 直接跳过（审批带过来的值不要动）
  const pickOption = async (label, text, skipIfSame) => {
    const cur = await readField(label);
    if (cur && cur.join('').trim()) {
      if (!skipIfSame || cur.join('').includes(text)) {
        log('  ' + label + ' 已有值，跳过: ' + JSON.stringify(cur));
        return true;
      }
      log('  ' + label + ' 已有值但与期望不符，将重填: ' + JSON.stringify(cur));
    }
    const pos = await locate(label);
    if (!pos) { errors.push('未找到字段: ' + label); return false; }
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(2400);
    const opts = await visibleOptions();
    const want = opts.find(o => o.t === text) || opts.find(o => o.t.includes(text));
    if (!want) { errors.push(label + ' 无选项「' + text + '」: ' + JSON.stringify(opts.map(o => o.t))); return false; }
    // ⚠ 优先用 locator 点（选项可能在视口外，locator 会自动滚动）；
    //   坐标点击作为兜底。
    const loc = p.locator('.el-select-dropdown__item').filter({ hasText: new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
    let clicked = false;
    if (await loc.count()) {
      await loc.click({ timeout: 6000 }).catch(() => {});
      clicked = true;
    }
    if (!clicked) await p.mouse.click(want.x, want.y);
    await p.waitForTimeout(2400);
    const v = await readField(label);
    log('  ' + label + ' = ' + JSON.stringify(v));
    return true;
  };

  const treeNodes = async () => p.evaluate(() => {
    const out = [];
    for (const e of [...document.querySelectorAll('.el-tree-node__content')]) {
      const bb = e.getBoundingClientRect();
      if (bb.width < 10 || bb.height < 4) continue;
      const label = ((e.querySelector('.custom-tree-node') || {}).innerText || '').trim();
      out.push({ t: label, x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) });
    }
    return out;
  });

  // 序列树：点文本才展开（必须精确匹配）
  const clickSeq = async (kw) => {
    const found = await p.evaluate((k) => {
      for (const e of document.querySelectorAll('.el-tree-node__content')) {
        const span = e.querySelector('.custom-tree-node');
        const label = ((span || e).innerText || '').replace(/\n+/g, ' ').trim();
        if (label !== k) continue;
        e.scrollIntoView({ block: 'center' });
        return true;
      }
      return false;
    }, kw);
    if (!found) return false;
    await p.waitForTimeout(900);
    const pos = await p.evaluate((k) => {
      for (const e of document.querySelectorAll('.el-tree-node__content')) {
        const span = e.querySelector('.custom-tree-node');
        const label = ((span || e).innerText || '').replace(/\n+/g, ' ').trim();
        if (label !== k) continue;
        const bb = (span || e).getBoundingClientRect();
        if (bb.width < 8) return null;
        return { x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) };
      }
      return null;
    }, kw);
    if (!pos) return false;
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(2600);
    return true;
  };

  const clickNode = async (kw) => {
    // ⚠ 必须精确匹配（===），且点 .custom-tree-node 里的文字，
    //   否则会点到别的节点（实测误选成「产品运营」）。
    const found = await p.evaluate((k) => {
      for (const e of document.querySelectorAll('.el-tree-node__content')) {
        const span = e.querySelector('.custom-tree-node');
        const label = ((span || e).innerText || '').replace(/\n+/g, ' ').trim();
        if (label !== k) continue;
        e.scrollIntoView({ block: 'center' });
        return true;
      }
      return false;
    }, kw);
    if (!found) return false;
    await p.waitForTimeout(900);
    const pos = await p.evaluate((k) => {
      for (const e of document.querySelectorAll('.el-tree-node__content')) {
        const span = e.querySelector('.custom-tree-node');
        const label = ((span || e).innerText || '').replace(/\n+/g, ' ').trim();
        if (label !== k) continue;
        const bb = (span || e).getBoundingClientRect();
        if (bb.width < 8) return null;
        return { x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) };
      }
      return null;
    }, kw);
    if (!pos) return false;
    await p.mouse.click(pos.x, pos.y);
    await p.waitForTimeout(2600);
    return true;
  };

  // ---------- 1. 试用期（触发薪酬两套）----------
  // ⚠ 审批带过来时试用期已有值 ⇒ 不要动（动了会丢审批链一致性）
  log('=== 1. 试用期 ===');
  {
    const cur = await readField('试用期');
    if (cur && cur.join('').trim()) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
      if (cur.join('') !== CFG.probationMonths + '个月') {
        errors.push('试用期与预期不符: ' + JSON.stringify(cur) + '（期望 ' + CFG.probationMonths + '个月）');
      }
    } else {
      await pickOption('试用期', CFG.probationMonths + '个月');
    }
  }

  // ---------- 2. 职级（序列→职级）----------
  log('=== 2. 职级 ===');
  {
    const cur = await readField('职级');
    if (cur && cur.join('').trim()) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
      if (!cur.join('').includes(CFG.rank)) errors.push('职级与预期不符: ' + JSON.stringify(cur));
    } else {
      await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(800);
      const rankInput = p.locator('input[placeholder="请选择职级"]').first();
      await rankInput.scrollIntoViewIfNeeded().catch(() => {});
      await p.waitForTimeout(700);
      await rankInput.click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(2800);
      let done = false;
      for (const seq of CFG.rankSeqOrder) {
        await clickSeq(seq);
        const L = await treeNodes();
        if (L.find(x => x.t === CFG.rank)) {
          await clickNode(CFG.rank);
          const v = await readField('职级');
          log('  职级 = ' + JSON.stringify(v));
          if (!v || !v.join('').includes(CFG.rank)) errors.push('职级未落位: ' + JSON.stringify(v));
          else done = true;
          break;
        }
      }
      if (!done) errors.push('职级未选中: ' + CFG.rank);
    }
  }

  // ---------- 3. 入职岗位 ----------
  log('=== 3. 入职岗位 ===');
  {
    const cur = await readField('入职岗位');
    if (cur && cur.join('').trim()) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
      if (!cur.join('').includes(CFG.position)) errors.push('岗位与预期不符: ' + JSON.stringify(cur));
    } else {
      await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(900);
      await p.evaluate(() => {
        for (const el of [...document.querySelectorAll('.el-select-dropdown, .el-popper')]) {
          const bb = el.getBoundingClientRect();
          if (bb.width > 5 && bb.height > 5 && !((el.className || '').toString().includes('popover-pd'))) el.remove();
        }
      });
      await p.waitForTimeout(700);
      const pos = await locate('入职岗位');
      if (!pos) errors.push('未找到入职岗位');
      else {
        await p.mouse.click(pos.x, pos.y);
        await p.waitForTimeout(2600);
        let done = false;
        for (const cat of CFG.jobCategoryOrder) {
          const ok = await p.evaluate((k) => {
            for (const e of document.querySelectorAll('.el-tree-node__content')) {
              const label = ((e.querySelector('.custom-tree-node') || {}).innerText || '').trim();
              if (label !== k) continue;
              e.scrollIntoView({ block: 'center' });
              return true;
            }
            return false;
          }, cat);
          if (!ok) continue;
          await p.waitForTimeout(800);
          const ic = await p.evaluate((k) => {
            for (const e of document.querySelectorAll('.el-tree-node__content')) {
              const label = ((e.querySelector('.custom-tree-node') || {}).innerText || '').trim();
              if (label !== k) continue;
              const i = e.querySelector('.el-tree-node__expand-icon');
              const ib = i ? i.getBoundingClientRect() : null;
              if (!ib || ib.width < 4) return null;
              return { x: Math.round(ib.x + ib.width / 2), y: Math.round(ib.y + ib.height / 2) };
            }
            return null;
          }, cat);
          if (ic) { await p.mouse.click(ic.x, ic.y); await p.waitForTimeout(2600); }
          const L = await treeNodes();
          if (L.find(x => x.t === CFG.position)) {
            await clickNode(CFG.position);
            const v = await readField('入职岗位');
            log('  入职岗位 = ' + JSON.stringify(v));
            if (!v || !v.join('').includes(CFG.position)) errors.push('岗位未落位: ' + JSON.stringify(v));
            else done = true;
            break;
          }
          if (ic) { await p.mouse.click(ic.x, ic.y); await p.waitForTimeout(1800); }
        }
        if (!done) errors.push('岗位未选中: ' + CFG.position);
      }
    }
  }

  // ---------- 4. 入职日期 ----------
  log('=== 4. 入职日期 ===');
  {
    const cur = await readInput('入职日期');
    if (cur && cur.join('').trim()) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
      const norm = s => (s || '').replace(/\//g, '');
      if (!norm(cur.join('')).includes(norm(CFG.onboardDate))) errors.push('入职日期与预期不符: ' + JSON.stringify(cur));
    } else {
      const pos = await locateInput('入职日期');
      if (!pos) errors.push('未找到入职日期');
      else {
        await p.mouse.click(pos.x, pos.y);
        await p.waitForTimeout(1200);
        await p.keyboard.type(CFG.onboardDate, { delay: 60 });
        await p.keyboard.press('Enter');
        await p.waitForTimeout(2200);
        const v = await readInput('入职日期');
        log('  入职日期 = ' + JSON.stringify(v));
        const norm = s => (s || '').replace(/\//g, '');
        if (!v || !norm(v.join('')).includes(norm(CFG.onboardDate))) errors.push('入职日期未落位: ' + JSON.stringify(v));
      }
    }
  }

  // ---------- 5. 合同主体 ----------
  log('=== 5. 合同主体 ===');
  await pickOption('合同主体', CFG.subject, true);

  // ---------- 6. 报到地址 ----------
  log('=== 6. 报到地址 ===');
  await pickOption('报到地址', CFG.reportAddress, true);

  // ---------- 7. 汇报对象 ----------
  // ⚠ 这个字段在审批带过来时**已经有值**（input 是 readonly 的），
  //   且它是远程联想（要联网查员工，频繁重试会失败）。
  //   ⇒ 先读当前值，有值就直接跳过；只有空的时候才去搜。
  log('=== 7. 汇报对象 ===');
  {
    const cur = await readField('汇报对象');
    if (cur && cur.join('').trim()) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
    } else {
      let done = false;
      for (let a = 1; a <= 3 && !done; a++) {
        const pos = await locate('汇报对象');
        if (!pos) { errors.push('未找到汇报对象'); break; }
        await p.mouse.click(pos.x, pos.y);
        await p.waitForTimeout(1200);
        await p.keyboard.press('Control+A').catch(() => {});
        await p.keyboard.press('Delete').catch(() => {});
        await p.keyboard.type(CFG.leader, { delay: 180 });
        await p.waitForTimeout(4000);
        const hit = await p.evaluate((nm) => {
          for (const pop of document.querySelectorAll('.el-popover.popover-pd, .el-popper.popover-pd')) {
            const pb = pop.getBoundingClientRect();
            if (!(pb.width > 50 && pb.height > 10)) continue;
            const cands = [...pop.querySelectorAll('div,span,li,p')].filter(e => {
              if (e.children.length > 0) return false;
              const t = (e.innerText || '').trim();
              if (!t.includes(nm)) return false;
              const bb = e.getBoundingClientRect();
              return bb.width > 5 && bb.height > 4;
            });
            if (!cands.length) continue;
            cands.sort((a2, b2) => (a2.innerText || '').length - (b2.innerText || '').length);
            const bb = cands[0].getBoundingClientRect();
            return { t: (cands[0].innerText || '').trim().slice(0, 40), x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) };
          }
          return null;
        }, CFG.leader);
        if (hit) {
          await p.mouse.click(hit.x, hit.y);
          await p.waitForTimeout(2400);
          const v = await readField('汇报对象');
          log('  汇报对象 = ' + JSON.stringify(v));
          if (!v || !v.join('').includes(CFG.leader)) errors.push('汇报对象未落位: ' + JSON.stringify(v));
          else done = true;
        } else {
          log('  第' + a + '次没匹配到');
          await p.keyboard.press('Escape').catch(() => {});
          await p.waitForTimeout(700);
        }
      }
      if (!done) errors.push('汇报对象未选中');
    }
  }

  // ---------- 8. 工作城市 ----------
  log('=== 8. 工作城市 ===');
  {
    const cur = await readField('工作城市');
    if (cur && cur.join('').trim()) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
      if (!cur.join('').includes(CFG.city)) errors.push('工作城市与预期不符: ' + JSON.stringify(cur));
    } else {
    const pos = await locate('工作城市');
    if (!pos) errors.push('未找到工作城市');
    else {
      await p.mouse.click(pos.x, pos.y);
      await p.waitForTimeout(2000);
      const findText = async (t) => p.evaluate((kw) => {
        for (const e of document.querySelectorAll('.select-world-city *, .city-list-content *, li, span')) {
          if ((e.innerText || '').trim() !== kw) continue;
          const bb = e.getBoundingClientRect();
          if (bb.width < 5) continue;
          return { x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) };
        }
        return null;
      }, t);
      const prov = await findText(CFG.cityProvince);
      if (!prov) errors.push('省份找不到');
      else {
        await p.mouse.click(prov.x, prov.y);
        await p.waitForTimeout(2200);
        const city = await findText(CFG.city);
        if (!city) errors.push('城市找不到');
        else {
          await p.mouse.click(city.x, city.y);
          await p.waitForTimeout(2200);
          const v = await readField('工作城市');
          log('  工作城市 = ' + JSON.stringify(v));
        }
      }
    }
    }
  }

  // ---------- 9. 薪酬（JS 赋值，索引 1~6）----------
  log('=== 9. 薪酬 ===');
  {
    const pay = CFG.pay;
    const r = await p.evaluate((pay) => {
      const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
      if (!item) return { err: 'no 薪酬区' };
      const ins = [...item.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 5);
      if (ins.length !== 9) return { err: '薪酬框数=' + ins.length };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const vals = [pay.prob.basic, pay.full.basic, pay.prob.secret, pay.full.secret, pay.prob.perf, pay.full.perf];
      for (let i = 0; i < 6; i++) {
        const idx = i + 1;
        setter.call(ins[idx], String(vals[i]));
        ins[idx].dispatchEvent(new Event('input', { bubbles: true }));
        ins[idx].dispatchEvent(new Event('change', { bubbles: true }));
        ins[idx].dispatchEvent(new Event('blur', { bubbles: true }));
      }
      return { ok: true };
    }, pay);
    log('  ' + JSON.stringify(r));
    if (r.err) errors.push('薪酬: ' + r.err);
    await p.waitForTimeout(2600);
    const totals = await p.evaluate(() => {
      const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
      if (!item) return null;
      return [...item.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 5).map(i => i.value);
    });
    log('  薪酬区: ' + JSON.stringify(totals));
    if (totals) {
      const expP = pay.prob.basic + pay.prob.secret + pay.prob.perf;
      const expF = pay.full.basic + pay.full.secret + pay.full.perf;
      log('  合计校验: 试用期 ' + totals[7] + '（期望 ' + expP + '）/ 转正后 ' + totals[8] + '（期望 ' + expF + '）');
      if (Number(totals[7]) !== expP || Number(totals[8]) !== expF) errors.push('薪酬合计不符');
    }
  }

  // ---------- 10. 抄送邮箱 ----------
  // ⚠ 抄送的值渲染成 **.el-tag 标签**（el-select__tags-text），不是 input.value。
  //   读 input.value 永远是空 → 会误判「未落位」。
  const readCc = async () => p.evaluate(() => {
    const norm = s => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');
    for (const e of document.querySelectorAll('div,span,label,p')) {
      if (norm(e.innerText) !== norm('抄送邮箱')) continue;
      if (e.children.length > 0) continue;
      let node = e;
      for (let k = 0; k < 8 && node; k++) {
        const tags = [...node.querySelectorAll('.el-select__tags-text')].map(x => (x.innerText || '').trim()).filter(Boolean);
        if (tags.length) return tags;
        const ins = [...node.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 5);
        if (ins.length) return ins.map(i => i.value).filter(Boolean);
        node = node.parentElement;
      }
    }
    return null;
  });

  log('=== 10. 抄送邮箱 ===');
  {
    const cur = await readCc();
    if (cur && cur.join('').includes(CC_NAME)) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
    } else {
      let done = false;
      for (let a = 1; a <= 3 && !done; a++) {
      // 点**可编辑**的那个 input（第一个），readonly 那个点不动
      const pos = await p.evaluate(() => {
        const norm = s => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');
        for (const e of document.querySelectorAll('div,span,label,p')) {
          if (norm(e.innerText) !== norm('抄送邮箱')) continue;
          if (e.children.length > 0) continue;
          let node = e;
          for (let k = 0; k < 8 && node; k++) {
            const ins = [...node.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 5 && !i.readOnly);
            if (ins.length) {
              const inp = ins[0];
              inp.scrollIntoView({ block: 'center' });
              const r = inp.getBoundingClientRect();
              return { x: Math.round(r.x + 20), y: Math.round(r.y + r.height / 2) };
            }
            node = node.parentElement;
          }
        }
        return null;
      });
      if (!pos) { errors.push('未找到抄送邮箱'); break; }
      await p.mouse.click(pos.x, pos.y);
      await p.waitForTimeout(1500);
      await p.keyboard.press('Control+A').catch(() => {});
      await p.keyboard.press('Delete').catch(() => {});
      await p.keyboard.type(CC_NAME, { delay: 150 });
      await p.waitForTimeout(3000);
      const hit = await p.evaluate((nm) => {
        for (const e of document.querySelectorAll('li, .el-select-dropdown__item')) {
          const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
          if (!t.startsWith(nm)) continue;
          const bb = e.getBoundingClientRect();
          if (bb.width < 8 || bb.height < 4) continue;
          return { x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2), t: t.slice(0, 40) };
        }
        return null;
      }, CC_NAME);
      if (hit) {
        await p.mouse.click(hit.x, hit.y);
        await p.waitForTimeout(2400);
        const v = await readCc();
        log('  抄送 = ' + JSON.stringify(v));
        if (!v || !v.join('').includes(CC_NAME)) errors.push('抄送邮箱未落位: ' + JSON.stringify(v));
        else done = true;
      } else {
        log('  第' + a + '次没匹配到');
        await p.keyboard.press('Escape').catch(() => {});
        await p.waitForTimeout(700);
      }
      }
      if (!done) errors.push('抄送邮箱未选中');
    }
  }

  // ---------- 11. offer有效期 ----------
  // ⚠ 这是**普通 input**（不是 el-select），默认已是 3（与 Neil 确认的口径一致）
  log('=== 11. offer有效期 ===');
  {
    const cur = await readInput('offer有效期');
    if (cur && cur.join('').trim()) {
      log('  已有值，跳过: ' + JSON.stringify(cur));
      if (cur.join('').trim() !== String(CFG.offerValidDays || 3)) {
        errors.push('offer有效期与预期不符: ' + JSON.stringify(cur));
      }
    } else {
      const pos = await locateInput('offer有效期');
      if (!pos) errors.push('未找到 offer有效期');
      else {
        await p.mouse.click(pos.x, pos.y);
        await p.waitForTimeout(1200);
        await p.keyboard.press('Control+A').catch(() => {});
        await p.keyboard.type(String(CFG.offerValidDays || 3), { delay: 80 });
        await p.keyboard.press('Enter');
        await p.waitForTimeout(2000);
        const v = await readInput('offer有效期');
        log('  offer有效期 = ' + JSON.stringify(v));
      }
    }
  }

  // ---------- 12. 校验 ----------
  log('\n=== 校验 ===');
  const chk = await p.evaluate(() => {
    const norm = s => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');
    const dedup = t => { const m = t.match(/^(.{1,20}?)\1+$/); return m ? m[1] : t; };
    const o = {};
    for (const el of document.querySelectorAll('.el-select')) {
      let n = el, label = '';
      for (let k = 0; k < 8 && n; k++) {
        const ln = n.querySelector ? n.querySelector('.label-name') : null;
        if (ln) { label = norm(ln.innerText); break; }
        n = n.parentElement;
      }
      const inp = el.querySelector('input');
      if (!inp) continue;
      const bb = el.getBoundingClientRect();
      if (bb.width <= 5) continue;
      const key = dedup(label);
      if (!o[key]) o[key] = [inp.value];
    }
    const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
    o['薪酬区'] = item ? [...item.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 5).map(i => i.value) : [];
    o['抄送邮箱'] = [...document.querySelectorAll('.el-select__tags-text')].map(x => (x.innerText || '').trim()).filter(Boolean);
    return o;
  });

  Object.entries(chk).forEach(([k, v]) => log('  ' + k + ' = ' + JSON.stringify(v)));
  if (errors.length) { log('\n  ERRORS:'); errors.forEach(e => log('    - ' + e)); }

  if (!DO_SEND) {
    log('\n>>> 停在发送前（未发送）');
    await b.close();
    process.exit(errors.length ? 1 : 0);
  }
  if (errors.length) { log('\n!! 有错误，不发送'); await b.close(); process.exit(1); }

  // ---------- 13. 预览 offer ----------
  // ⚠ 必须**坐标点击**：locator 的 :visible 过滤在这个表单上失效（点不动）。
  log('\n=== 预览 offer ===');
  {
    const pos = await p.evaluate(() => {
      for (const el of document.querySelectorAll('button, .el-button')) {
        if ((el.innerText || '').trim() !== '预览offer') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 5) continue;
        el.scrollIntoView({ block: 'center' });
        return { found: true };
      }
      return { found: false };
    });
    if (!pos.found) errors.push('未找到「预览offer」按钮');
    else {
      await p.waitForTimeout(1200);
      const pos2 = await p.evaluate(() => {
        for (const el of document.querySelectorAll('button, .el-button')) {
          if ((el.innerText || '').trim() !== '预览offer') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 5) continue;
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }
        return null;
      });
      if (!pos2) errors.push('「预览offer」坐标取不到');
      else await p.mouse.click(pos2.x, pos2.y);
      await p.waitForTimeout(6000);
      // ⚠ 预览时可能弹确认框（超编提示等）⇒ 先处理掉
      for (let i = 0; i < 3; i++) {
        const dlg = await p.evaluate(() => {
          for (const d of document.querySelectorAll('.el-dialog, .el-message-box, [role="dialog"]')) {
            const r = d.getBoundingClientRect();
            if (!(r.width > 100 && r.height > 60)) continue;
            const t = (d.innerText || '').replace(/\n+/g, ' | ').slice(0, 100);
            for (const b of d.querySelectorAll('button, .el-button')) {
              const bt = (b.innerText || '').trim();
              if (bt !== '确定') continue;
              const br = b.getBoundingClientRect();
              if (br.width < 5) continue;
              return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2), text: t };
            }
          }
          return null;
        });
        if (!dlg) break;
        log('  预览弹窗: ' + dlg.text);
        await p.mouse.click(dlg.x, dlg.y);
        await p.waitForTimeout(5000);
      }
      const after = await p.evaluate(() => [...document.querySelectorAll('button, .el-button')]
        .map(b => (b.innerText || '').trim()).filter(Boolean));
      log('  预览后按钮: ' + JSON.stringify(after.slice(0, 8)));
      if (!after.includes('修改邮件')) errors.push('预览未生效（无「修改邮件」按钮）');
    }
    log('  URL: ' + p.url());
  }

  // ---------- 14. 邮件模板 → 正式员工 - 福州 ----------
  // ⚠ 预览后**所有 .el-select 的 label 都变成重复形式**（"姓名 姓名："），
  //   且模板下拉没有 .label-name ⇒ 只能按 **input.value** 匹配定位。
  log('=== 邮件模板 ===');
  {
    const tplIdx = await p.evaluate(() => {
      const list = [...document.querySelectorAll('.el-select')];
      for (let i = 0; i < list.length; i++) {
        const inp = list[i].querySelector('input');
        if (inp && /正式员工|校招|实习/.test(inp.value)) return i;
      }
      return -1;
    });
    if (tplIdx < 0) { errors.push('未找到邮件模板下拉'); }
    else {
      const cur = await p.evaluate((i) => {
        const el = document.querySelectorAll('.el-select')[i];
        const inp = el ? el.querySelector('input') : null;
        return inp ? inp.value : '';
      }, tplIdx);
      log('  当前模板值: ' + JSON.stringify(cur));
      if (String(cur).trim() !== MAIL_TPL) {
        const sel = p.locator('.el-select').nth(tplIdx);
        await sel.scrollIntoViewIfNeeded().catch(() => {});
        await p.waitForTimeout(600);
        await sel.click({ timeout: 8000 }).catch(async () => {
          const bb = await sel.boundingBox();
          if (bb) await p.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2));
        });
        await p.waitForTimeout(2200);
        const opts = await visibleOptions();
        log('  选项: ' + JSON.stringify(opts.map(o => o.t)));
        const want = opts.find(o => o.t === MAIL_TPL);
        if (!want) errors.push('模板下拉无「' + MAIL_TPL + '」: ' + JSON.stringify(opts.map(o => o.t)));
        else {
          const loc = p.locator('.el-select-dropdown__item').filter({ hasText: new RegExp('^' + MAIL_TPL.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '$') }).first();
          if (await loc.count()) await loc.click({ timeout: 6000 }).catch(() => {});
          else await p.mouse.click(want.x, want.y);
          await p.waitForTimeout(2200);
        }
      } else {
        log('  已是「' + MAIL_TPL + '」，无需重选');
      }
      const tplVal = await p.evaluate((i) => {
        const el = document.querySelectorAll('.el-select')[i];
        const inp = el ? el.querySelector('input') : null;
        return inp ? inp.value : '(未找到)';
      }, tplIdx);
      log('  模板值: ' + JSON.stringify(tplVal));
      if (String(tplVal).trim() !== MAIL_TPL) errors.push('邮件模板未生效: ' + tplVal);
    }
  }

  // ---------- 15. 修改邮件 → 插图 ----------
  log('=== 插图 ===');
  {
    // ⚠ 坐标点击（locator 的 :visible 在这个表单上会失效）
    // ⚠⚠ 必须先滚动到视口内再取坐标 —— 「修改邮件」在页面底部，
    //   scrollIntoView 后坐标会变，所以滚动完再取。
    const editPos = await p.evaluate(() => {
      for (const el of document.querySelectorAll('button, .el-button')) {
        if ((el.innerText || '').trim() !== '修改邮件') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 5) continue;
        el.scrollIntoView({ block: 'center' });
        return { found: true };
      }
      return { found: false };
    });
    if (!editPos.found) errors.push('未找到「修改邮件」');
    else {
      await p.waitForTimeout(1200);
      const pos = await p.evaluate(() => {
        for (const el of document.querySelectorAll('button, .el-button')) {
          if ((el.innerText || '').trim() !== '修改邮件') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 5) continue;
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }
        return null;
      });
      if (!pos) errors.push('「修改邮件」坐标取不到');
      else {
        log('  「修改邮件」坐标: ' + JSON.stringify(pos));
        await p.mouse.click(pos.x, pos.y);
        await p.waitForTimeout(7000);
        const opened = await p.evaluate(() => {
          const eds = [...document.querySelectorAll('.wangEditor-txt, [contenteditable="true"]')]
            .filter(e => e.getBoundingClientRect().width > 100);
          return eds.length;
        });
        log('  已点「修改邮件」，编辑器数: ' + opened);
        if (!opened) errors.push('「修改邮件」弹窗未打开（无编辑器）');
      }
    }

    const modal = p.locator('.el-dialog:visible').last();
    const picIn = modal.locator('.wangeditor-menu-img-picture, [class*="img-picture"]').first();
    if (await picIn.count()) {
      await p.evaluate(() => {
        const eds = [...document.querySelectorAll('.wangEditor-txt')];
        const ed = eds[eds.length - 1];
        if (!ed) return;
        ed.focus();
        const range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      await p.waitForTimeout(600);
      await picIn.scrollIntoViewIfNeeded().catch(() => {});
      await p.waitForTimeout(500);
      await picIn.click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const upModal = p.locator('.el-dialog:visible').last();
      const clickUpload = upModal.locator('text=/点击上传/').first();
      if (await clickUpload.count()) { await clickUpload.click({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(1200); }
      const fileIdx = await p.evaluate(() => {
        const pops = [...document.querySelectorAll('.el-dialog, .el-modal, [role="dialog"]')].filter(d => {
          const r = d.getBoundingClientRect(); return r.width > 100 && r.height > 100;
        });
        for (const d of pops) {
          const title = ((d.querySelector('.el-dialog__title, .el-modal__title, [class*="title"]') || {}).innerText || '').trim();
          if (!/图片上传|上传图片/.test(title)) continue;
          const all = [...document.querySelectorAll('input[type="file"]')];
          const f = d.querySelector('input[type="file"]');
          return f ? all.indexOf(f) : -1;
        }
        return -1;
      });
      if (fileIdx >= 0) {
        await p.locator('input[type="file"]').nth(fileIdx).setInputFiles(CFG.img);
        log('  已上传: ' + CFG.img);
        await p.waitForTimeout(9000);
      } else errors.push('未找到图片上传的 file input');
    } else errors.push('未找到图片按钮');
  }

  // ---------- 16. 正文条款校验（必须在弹窗关闭前）----------
  log('=== 正文校验 ===');
  {
    const bodyChk = await p.evaluate(() => {
      const eds = [...document.querySelectorAll('.wangEditor-txt')];
      const ed = eds[eds.length - 1];
      if (!ed) return { err: 'no editor' };
      const t = ed.innerText || '';
      return {
        len: t.length,
        head: t.slice(0, 50).replace(/\n+/g, ' '),
        liZhiMing: /离职证明/.test(t),
        xinZi: /薪资证明/.test(t),
        shangYiJia: /上一家工作单位/.test(t),
        xianSheng: /(先生\/女士|先生|女士)/.test(t),
        tongXue: /同学/.test(t),
        imgCount: ed.querySelectorAll('img').length,
      };
    });
    log('  ' + JSON.stringify(bodyChk));
    if (bodyChk.err) errors.push('正文校验失败: ' + bodyChk.err);
    else {
      if (!bodyChk.liZhiMing || !bodyChk.xinZi || !bodyChk.shangYiJia) errors.push('正文缺社招条款 ⇒ 可能用了校招模板');
      if (bodyChk.tongXue) errors.push('正文出现「同学」⇒ 用的是校招模板');
      if (!bodyChk.xianSheng) errors.push('正文无「先生/女士」称呼');
      if (bodyChk.imgCount < 2) errors.push('正文图片数=' + bodyChk.imgCount + '（期望 ≥2：模板水印图 + 意向书）');
    }
  }

  // ---------- 17. 确定（修改邮件内容弹窗）----------
  const okBtn3 = await p.evaluate(() => {
    for (const d of [...document.querySelectorAll('.el-dialog, .el-modal, [role="dialog"]')]) {
      const r = d.getBoundingClientRect();
      if (!(r.width > 100 && r.height > 100)) continue;
      const title = ((d.querySelector('.el-dialog__title, .el-modal__title, [class*="title"]') || {}).innerText || '').trim();
      if (!/修改邮件内容/.test(title)) continue;
      for (const b of d.querySelectorAll('button')) {
        if ((b.innerText || '').trim() !== '确定') continue;
        const br = b.getBoundingClientRect();
        if (br.width < 1) continue;
        return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2) };
      }
    }
    return null;
  });
  if (okBtn3) { await p.mouse.click(okBtn3.x, okBtn3.y); await p.waitForTimeout(4000); log('  已点「修改邮件内容」的确定'); }
  else errors.push('未找到「修改邮件内容」弹窗的确定');

  // ---------- 18. 发送 ----------
  log('=== 发送 ===');
  if (errors.length) { log('  有错误，中止发送:'); errors.forEach(e => log('    - ' + e)); await b.close(); process.exit(1); }
  {
    const sendPos = await p.evaluate(() => {
      for (const el of document.querySelectorAll('button, .el-button')) {
        const t = (el.innerText || '').trim();
        if (t !== '发送Offer') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        el.scrollIntoView({ block: 'center' });
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
      return null;
    });
    log('  发送按钮: ' + JSON.stringify(sendPos));
    if (!sendPos) { errors.push('未找到发送Offer按钮'); }
    else {
      await p.waitForTimeout(1200);
      const P = await p.evaluate(() => {
        for (const el of document.querySelectorAll('button, .el-button')) {
          if ((el.innerText || '').trim() !== '发送Offer') continue;
          const r = el.getBoundingClientRect();
          if (!r.width) continue;
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }
        return null;
      });
      await p.mouse.click((P || sendPos).x, (P || sendPos).y);
      await p.waitForTimeout(6000);
      // 确认弹窗
      for (let i = 0; i < 3; i++) {
        const dlg = await p.evaluate(() => {
          for (const d of [...document.querySelectorAll('.el-dialog, .el-message-box, [role="dialog"]')]) {
            const r = d.getBoundingClientRect();
            if (!(r.width > 100 && r.height > 60)) continue;
            for (const b of d.querySelectorAll('button, .el-button')) {
              const t = (b.innerText || '').trim();
              if (t !== '确定') continue;
              const br = b.getBoundingClientRect();
              if (br.width < 5) continue;
              return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2), text: (d.innerText || '').replace(/\n+/g, ' | ').slice(0, 120) };
            }
          }
          return null;
        });
        if (!dlg) break;
        log('  确认弹窗: ' + dlg.text);
        await p.mouse.click(dlg.x, dlg.y);
        await p.waitForTimeout(4000);
      }
      const msgs = await p.evaluate(() => [...document.querySelectorAll('.el-message, .el-notification')].map(e => e.innerText.trim()).filter(Boolean));
      log('  提示: ' + JSON.stringify(msgs));
      log('  发送后 URL: ' + p.url());
    }
  }

  await b.close();
  log('\n=== 完成 ===');
  if (errors.length) { errors.forEach(e => console.log('  ! ' + e)); process.exit(1); }
})();
