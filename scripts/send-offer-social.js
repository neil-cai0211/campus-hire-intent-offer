// offer 发送流程 · 社招版（可配置停在最后一步之前）
// 步骤：列表页→offer环节→卡片「发送Offer」→【社招差异】入职日期/试用期/薪酬已由录用审批带过来
//       → 选抄送邮箱→预览offer→超编弹窗(坐标确定)→邮件模板选「正式员工 - 福州」→修改邮件→底部插图
//       → 校验社招条款→确认→【可选】发送offer
// 用法: node send-offer-social.js <姓名> <目标岗位关键字> <录用意向书JPEG绝对路径> [--send]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

// skill 配置（路径自适应：工作区副本与 skill 内副本都能跑）
const SKILL = process.env.HIRE_SKILL_DIR || (process.env.USERPROFILE || process.env.HOME) + '/.workbuddy/skills/campus-hire-intent-offer';
const local = (() => { try { return require(path.join(SKILL, 'config.local.js')); } catch (e) { return {}; } })();
// 抄送邮箱的收件人姓名（真实姓名在 config.local.js，仓库内用占位符）
const CC_NAME = local.ccName || 'HR联系人';

const NAME = process.argv[2] || '陈溢滨';
const JOB_KEY = process.argv[3] || '售前实施技术专员';
const IMG = process.argv[4];
const DO_SEND = process.argv.includes('--send');
const OUT = 'D:/AI-Workspace/liuyi-work';   // 截图输出

// ⚠ 插图（jpg）必须与当前意向书 PDF 同步 —— 改了 PDF 没重新生成插图，
//   邮件里发出去的就是旧版。这里用「同目录 PDF 的修改时间 vs jpg 的修改时间」做校验：
//   jpg 比 PDF 旧 ⇒ 插图没更新 ⇒ 直接中止，不允许发。
if (IMG) {
  const pdfDir = 'D:/AI-Workspace/录用意向书/out';
  const base = path.basename(IMG).replace(/\.jpg$/i, '.pdf');
  const pdfGuess = path.join(pdfDir, base);
  if (fs.existsSync(pdfGuess)) {
    const pdfM = fs.statSync(pdfGuess).mtimeMs;
    const imgM = fs.statSync(IMG).mtimeMs;
    if (imgM < pdfM) {
      console.error('✗ 中止：插图比意向书 PDF 旧（PDF ' + new Date(pdfM).toLocaleString('zh-CN') +
        ' / JPG ' + new Date(imgM).toLocaleString('zh-CN') + '）');
      console.error('  先重新生成插图：node make-insert-png.js');
      process.exit(2);
    }
    console.log('插图时效校验: OK（jpg 不早于 pdf）');
  } else {
    console.log('插图时效校验: 跳过（未找到对应 PDF: ' + pdfGuess + '）');
  }
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('xinrenxinshi')) || ctx.pages()[0];
  await page.setViewportSize({ width: 1600, height: 1100 });
  const log = (...a) => console.log(...a);
  const errors = [];
  // 截图（页面重绘慢时会超时，不应中断流程）
  const shot = async (file) => {
    try { await page.screenshot({ path: file, timeout: 12000, animations: 'disabled', caret: 'hide' }); }
    catch (e) { console.log('  (截图跳过: ' + e.message.slice(0, 40) + ')'); }
  };

  const norm = s => (s || '').replace(/[\s*:：]/g, '').replace(/^\*/, '');

  // 定位字段容器
  async function field(label) {
    const items = page.locator('.el-form-item');
    const cnt = await items.count();
    for (let i = 0; i < cnt; i++) {
      const it = items.nth(i);
      const lbs = it.locator('.el-form-item__label, label, [class*="label"]');
      const lc = await lbs.count();
      for (let j = 0; j < lc; j++) {
        if (norm(await lbs.nth(j).innerText()) === norm(label)) return it;
      }
    }
    return null;
  }

  // ---------- 1. 进 offer 环节，点「发送Offer」 ----------
  await page.goto('https://s.xinrenxinshi.com/recruitment/list', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  const t = page.locator('.stage-name', { hasText: /^offer$/ }).first();
  if (await t.count()) { await t.click(); await page.waitForTimeout(4000); }
  const box = page.locator('input[placeholder*="姓名"]').first();
  await box.click(); await box.fill(NAME); await page.keyboard.press('Enter');
  await page.waitForTimeout(4500);

  const cards = page.locator('.card-item');
  const n = await cards.count();
  log(`搜索 "${NAME}" 命中 ${n} 条`);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    await cards.nth(i).hover(); await page.waitForTimeout(400);
    const tx = await cards.nth(i).innerText();
    const btns = await cards.nth(i).evaluate(el => [...el.querySelectorAll('.operation-button')].map(b => b.innerText.trim()));
    log(`  卡片${i}: 岗位含"${JOB_KEY}"=${tx.includes(JOB_KEY)} 按钮=${JSON.stringify(btns)}`);
    if (tx.includes(JOB_KEY) && btns.includes('发送Offer')) { idx = i; break; }
  }
  const card = cards.nth(idx);
  await card.hover(); await page.waitForTimeout(900);
  // ⚠ 卡片按钮 hover 才显示，locator.click() 可能报 "element is not visible" → 用坐标点击
  const cardBtnPos = await card.evaluate(el => {
    for (const b of el.querySelectorAll('.operation-button')) {
      if ((b.innerText || '').trim() !== '发送Offer') continue;
      const r = b.getBoundingClientRect();
      if (r.width === 0) return null;
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return null;
  });
  if (cardBtnPos) {
    log(`  坐标点击卡片「发送Offer」@(${cardBtnPos.x},${cardBtnPos.y})`);
    await page.mouse.click(cardBtnPos.x, cardBtnPos.y);
  } else {
    log('  卡片按钮坐标取不到，回退 locator.click');
    await card.locator('.operation-button', { hasText: '发送Offer' }).first().click();
  }
  await page.waitForTimeout(7000);
  log('offer 表单页:', page.url());
  if (!page.url().includes('/send-offer')) {
    log('✗ 未进入 offer 表单页');
    errors.push('未进入 offer 表单页');
    await browser.close(); process.exit(3);
  }

  // ---------- 2. 【社招】入职日期 / 试用期 / 薪酬 已由录用审批带过来，只做校验不改 ----------
  // 社招的 offer 表单会自动继承录用审批的值（入职日期 2026/11/06、试用期 3 个月、
  // 转正日期 2027/02/06、薪酬 6 项及两个合计）。这里只核对，不覆盖 —— 覆盖反而可能与审批不一致。
  const EXPECT = {
    '入职日期': /2026\/11\/06/,
    '试用期': /3个月/,
    '转正日期': /2027\/02\/06/,
  };
  for (const [lb, re] of Object.entries(EXPECT)) {
    const it = await field(lb);
    if (!it) { errors.push('未找到' + lb + '字段'); continue; }
    const v = await it.locator('input').first().inputValue();
    log(`  ${lb} => ${v}`);
    if (!re.test(v)) errors.push(`${lb} 与录用审批不一致: ${v}`);
  }
  // offer有效期：默认 3 天，与意向书的告知有效期对应
  {
    const it = await page.evaluate(() => {
      for (const i of document.querySelectorAll('.el-form-item')) {
        const t = (i.innerText || '');
        if (/offer有效期/.test(t)) {
          const inp = [...i.querySelectorAll('input')].find(x => x.getBoundingClientRect().width > 5);
          return inp ? inp.value : null;
        }
      }
      return null;
    });
    log(`  offer有效期 => ${it}`);
    if (it !== '3') errors.push(`offer有效期应为 3 天，实际 ${it}`);
  }
  // 薪酬两套合计（转正后 / 试用期）
  {
    const sal = await page.evaluate(() => {
      const o = {};
      const item = [...document.querySelectorAll('.item')].find(e => /薪酬/.test(e.innerText || ''));
      if (!item) return null;
      [...item.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 5).forEach(i => {
        let n = i, c = '';
        for (let k = 0; k < 8 && n; k++) { n = n.parentElement; if (!n) break;
          const t = (n.innerText || '').replace(/\n+/g, ' ').trim();
          if (t && t.length < 70) { c = t.replace(/[：:]/g, ''); break; } }
        o[c] = i.value;
      });
      return o;
    });
    if (sal) {
      log(`  薪酬合计: 试用期 ${sal['试用期工资合计']} / 转正后 ${sal['转正后工资合计']}`);
      if (Number(sal['试用期工资合计']) <= 0 || Number(sal['转正后工资合计']) <= 0) errors.push('薪酬合计为 0');
    }
  }

  // ---------- 3. 抄送邮箱选收件人（必选，最多重试 4 次）----------
  const ccItem = await field('抄送邮箱');
  if (!ccItem) errors.push('未找到抄送邮箱字段');
  else {
    const ccSelected = async () => await page.evaluate(() => {
      for (const it of document.querySelectorAll('.el-form-item')) {
        const ls = [...it.querySelectorAll('.el-form-item__label, label, [class*="label"]')];
        if (!ls.some(l => (l.innerText || '').replace(/[\s*:：]/g, '').includes('抄送邮箱'))) continue;
        return { text: it.innerText.replace(/\n+/g, ' ').slice(0, 100), tags: [...it.querySelectorAll('.el-tag')].map(t => t.innerText.trim()) };
      }
      return null;
    });

    let selected = false;
    for (let attempt = 1; attempt <= 4 && !selected; attempt++) {
      const st = await ccSelected();
      if (st && st.text.includes(CC_NAME)) { selected = true; log('  ✓ 抄送邮箱已选中 ' + CC_NAME); break; }
      log(`  第${attempt}次选择抄送邮箱`);

      // 点可编辑 input 唤起联想
      const pos = await page.evaluate(() => {
        for (const it of document.querySelectorAll('.el-form-item')) {
          const ls = [...it.querySelectorAll('.el-form-item__label, label, [class*="label"]')];
          if (!ls.some(l => (l.innerText || '').replace(/[\s*:：]/g, '').includes('抄送邮箱'))) continue;
          const inp = [...it.querySelectorAll('input')].find(i => !i.readOnly);
          if (!inp) return null;
          inp.scrollIntoView({ block: 'center' });
          const r = inp.getBoundingClientRect();
          return { x: Math.round(r.x + 20), y: Math.round(r.y + r.height / 2) };
        }
        return null;
      });
      if (!pos) { log('  ✗ 抄送邮箱无可编辑 input'); break; }
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(1500);

      // 输入关键字（原生 setter + input + keyup 事件）
      await page.evaluate(() => {
        for (const it of document.querySelectorAll('.el-form-item')) {
          const ls = [...it.querySelectorAll('.el-form-item__label, label, [class*="label"]')];
          if (!ls.some(l => (l.innerText || '').replace(/[\s*:：]/g, '').includes('抄送邮箱'))) continue;
          const inp = [...it.querySelectorAll('input')].find(i => !i.readOnly);
          if (!inp) return;
          inp.focus();
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inp, CC_NAME);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: CC_NAME.slice(-1) }));
          return;
        }
      });
      await page.waitForTimeout(2500);

      // 找候选并点击
      const opts = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.el-select-dropdown, .el-autocomplete-suggestion, [class*="suggestion"], .el-popper').forEach(d => {
          const r = d.getBoundingClientRect();
          if (!(r.width > 50 && r.height > 20)) return;
          d.querySelectorAll('.el-select-dropdown__item, li, [class*="item"]').forEach(i => {
            const t = (i.innerText || '').trim();
            if (t && t.length < 60) out.push(t);
          });
        });
        return [...new Set(out)];
      });
      log(`  候选: ${JSON.stringify(opts.slice(0, 6))}`);
      const hit = opts.find(o => o.includes(CC_NAME));
      if (!hit) { log('  ✗ 候选里无 ' + CC_NAME + '，重试'); continue; }

      await page.evaluate((kw) => {
        const list = [];
        document.querySelectorAll('.el-select-dropdown, .el-autocomplete-suggestion, [class*="suggestion"], .el-popper').forEach(d => {
          const r = d.getBoundingClientRect();
          if (!(r.width > 50 && r.height > 20)) return;
          d.querySelectorAll('.el-select-dropdown__item, li, [class*="item"]').forEach(i => list.push(i));
        });
        const el = list.find(e => (e.innerText || '').trim().includes(kw));
        if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }, CC_NAME);
      await page.waitForTimeout(2000);
    }

    const st = await ccSelected();
    log(`  抄送邮箱最终: ${JSON.stringify(st)}`);
    if (!st || !st.text.includes(CC_NAME)) errors.push('抄送邮箱未选中 ' + CC_NAME + '（必填）');
    else log('  ✓ 抄送邮箱 = ' + CC_NAME);
  }

  await shot(`${OUT}/offer-3-filled.png`);

  // ---------- 4. 点「预览offer」 ----------
  const prev = page.locator('button:visible', { hasText: /^预览offer$/ }).first();
  await prev.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await prev.click();
  log('已点「预览offer」');
  await page.waitForTimeout(4000);

  // ---------- 5. 超编弹窗（坐标点确定），循环处理 ----------
  const findDialog = async () => await page.evaluate(() => {
    const sels = ['.el-message-box', '.el-dialog', '.el-confirm', '[class*="confirm"]'];
    for (const sel of sels) {
      for (const d of document.querySelectorAll(sel)) {
        const r = d.getBoundingClientRect();
        if (!(r.width > 100 && r.height > 40)) continue;
        const cs = getComputedStyle(d);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const btns = [...d.querySelectorAll('button')].filter(b => {
          const t = (b.innerText || '').trim();
          const br = b.getBoundingClientRect();
          return t === '确定' && br.width > 0 && br.height > 0;
        });
        if (!btns.length) continue;
        const br = btns[0].getBoundingClientRect();
        return { text: (d.innerText || '').replace(/\n+/g, ' | ').slice(0, 140), sel,
          x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2) };
      }
    }
    return null;
  });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1500);
    const dlg = await findDialog();
    if (!dlg) { if (i === 0) log('  无弹窗'); else log('  弹窗已全部处理'); break; }
    log(`  弹窗${i + 1} [${dlg.sel}]: ${dlg.text}`);
    log(`  坐标点击确定 @(${dlg.x},${dlg.y})`);
    await page.mouse.click(dlg.x, dlg.y);
    await page.waitForTimeout(3000);
  }

  await shot(`${OUT}/offer-4-preview.png`);
  log('URL:', page.url());

  // ---------- 6. 邮件模板选「校招」 ----------
  const tplInput = page.locator('input[placeholder*="模板"], .el-select input').first();
  const tplFound = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input, .el-select').forEach(el => {
      const t = (el.innerText || el.placeholder || '').trim();
      if (/模板/.test(t)) out.push({ t, cls: (el.className||'').toString().slice(0,50) });
    });
    return out;
  });
  log('模板控件:', JSON.stringify(tplFound));

  // 找到模板下拉并选「校招」
  // 【社招】邮件模板必须选「正式员工 - 福州」（不是「校招」）
  // ⚠ 正式员工版正文含「离职证明 / 薪资证明 / 非中国国籍公民」等社招专属条款，
  //   称呼是「先生/女士 您好」；校招版是「同学」且无离职证明要求。
  // ⚠ 定位方式：按 .el-select 里 input.value 匹配（innerText 匹配不到，实测 text 为空）
  const MAIL_TPL = '正式员工 - 福州';
  const tplIdx = await page.evaluate(() => {
    const list = [...document.querySelectorAll('.el-select')];
    for (let i = 0; i < list.length; i++) {
      const inp = list[i].querySelector('input');
      if (inp && /正式员工|校招|实习/.test(inp.value)) return i;
    }
    return -1;
  });
  if (tplIdx < 0) {
    errors.push('未找到邮件模板下拉');
  } else {
    const tplSelect = page.locator('.el-select').nth(tplIdx);
    await tplSelect.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await tplSelect.click({ timeout: 8000 }).catch(async () => {
      const bb = await tplSelect.boundingBox();
      if (bb) await page.mouse.click(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2));
    });
    await page.waitForTimeout(2200);
    const opts = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.el-select-dropdown__item').forEach(e => {
        const bb = e.getBoundingClientRect();
        const t = (e.innerText || '').trim();
        if (t && bb.width > 8) out.push({ t, x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) });
      });
      return out;
    });
    log('  模板选项:', JSON.stringify(opts.map(o => o.t)));
    const target = opts.find(o => o.t === MAIL_TPL);
    if (!target) {
      errors.push('模板下拉无「' + MAIL_TPL + '」选项: ' + JSON.stringify(opts.map(o => o.t)));
    } else {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(2000);
      log('  已选模板:', MAIL_TPL);
    }
  }

  // 校验模板值确实落到位（草稿不保存，选了也可能在下一步被重置）
  const tplVal = await page.evaluate((i) => {
    const el = document.querySelectorAll('.el-select')[i];
    const inp = el ? el.querySelector('input') : null;
    return inp ? inp.value : '(未找到)';
  }, tplIdx);
  log('  模板当前值:', JSON.stringify(tplVal));
  if (String(tplVal).trim() !== MAIL_TPL) errors.push('邮件模板未生效: 期望「' + MAIL_TPL + '」实际「' + tplVal + '」');

  await shot(`${OUT}/offer-5-template.png`);

  // ---------- 7. 点「修改邮件」----------
  // 注意：「修改邮件」在预览页底部（y 较大），需滚动到底才能点到
  const editBtn = page.locator('button.el-button').filter({ hasText: /^修改邮件$/ }).first();
  if (await editBtn.count()) {
    await editBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await editBtn.click();
    log('已点「修改邮件」');
    await page.waitForTimeout(3500);
  } else {
    errors.push('未找到「修改邮件」按钮');
  }

  const editor = await page.evaluate(() => {
    const out = { editors: [], toolbars: [] };
    document.querySelectorAll('.wangEditor-txt, [contenteditable="true"], textarea').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 200) out.editors.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,60), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
    });
    document.querySelectorAll('[class*="wangEditor"], .w-e-toolbar, [class*="toolbar"]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 200) out.toolbars.push({ cls: (el.className||'').toString().slice(0,60), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
    });
    return out;
  });
  log('编辑器:', JSON.stringify(editor.editors));

  // ---------- 8. 插入图片（弹窗内图片按钮 → 图片上传弹窗 → 上传）----------
  if (IMG) {
    const modal = page.locator('.el-dialog:visible').last();
    // 弹窗内的图片图标（wangEditor 工具栏）
    const picIn = modal.locator('.wangeditor-menu-img-picture, [class*="img-picture"]').first();
    if (await picIn.count()) {
      // ⚠ 先把光标移到编辑器内容末尾，图片才会插到最底部
      await page.evaluate(() => {
        const eds = [...document.querySelectorAll('.wangEditor-txt')];
        const ed = eds[eds.length - 1];
        if (!ed) return;
        ed.focus();
        // 选中全部再取消选中，光标落到末尾
        const range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      await page.waitForTimeout(600);

      await picIn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await picIn.click();
      log('已点「修改邮件内容」弹窗内的图片按钮');
      await page.waitForTimeout(2500);
      await shot(`${OUT}/offer-6a-imgdialog.png`);

      // 内层「图片上传」弹窗：点「或点击上传」触发 file input
      const upModal = page.locator('.el-dialog:visible').last();
      const clickUpload = upModal.locator('text=/点击上传/').first();
      if (await clickUpload.count()) {
        await clickUpload.click();
        log('已点「或点击上传」');
        await page.waitForTimeout(1200);
      }

      // 定位「图片上传」弹窗内的 file input（按标题匹配）
      const fileIdx = await page.evaluate(() => {
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
      log('图片上传 file input 序号:', fileIdx);
      if (fileIdx >= 0) {
        await page.locator('input[type="file"]').nth(fileIdx).setInputFiles(IMG);
        log('已上传:', IMG);
        await page.waitForTimeout(8000);
      } else {
        errors.push('未找到「图片上传」弹窗内的 file input');
      }
      await shot(`${OUT}/offer-6b-uploaded.png`);

      // 图片上传弹窗内的确定/插入按钮（按标题「图片上传」精确匹配）
      const okBtn = await page.evaluate(() => {
        const pops = [...document.querySelectorAll('.el-dialog, .el-modal, [role="dialog"]')].filter(d => {
          const r = d.getBoundingClientRect(); return r.width > 100 && r.height > 100;
        });
        for (const d of pops) {
          const title = ((d.querySelector('.el-dialog__title, .el-modal__title, [class*="title"]') || {}).innerText || '').trim();
          if (!/图片上传|上传图片/.test(title)) continue;
          const b = [...d.querySelectorAll('button')].find(x => {
            const t = (x.innerText||'').trim();
            return /^(确定|确认|插入|上传|OK)$/i.test(t) && x.getBoundingClientRect().width > 0;
          });
          if (!b) continue;
          const br = b.getBoundingClientRect();
          return { x: Math.round(br.x + br.width/2), y: Math.round(br.y + br.height/2), label: b.innerText.trim(), title };
        }
        return null;
      });
      if (okBtn) {
        log(`  坐标点击「${okBtn.title}」的「${okBtn.label}」@(${okBtn.x},${okBtn.y})`);
        await page.mouse.click(okBtn.x, okBtn.y);
        await page.waitForTimeout(3500);
      } else {
        log('  图片上传弹窗无按钮（可能上传后自动插入）');
      }
      await shot(`${OUT}/offer-7-image.png`);
    } else {
      errors.push('未找到图片按钮');
    }
  }

  // 验证编辑器里是否有图片
  const imgCheck = await page.evaluate(() => {
    const eds = [...document.querySelectorAll('.wangEditor-txt')];
    const ed = eds[eds.length - 1];
    if (!ed) return { ed: false, allPics: document.querySelectorAll('img').length };
    return {
      ed: true,
      imgs: [...ed.querySelectorAll('img')].map(i => ({ src: (i.src||'').slice(0,70), nw: i.naturalWidth })),
      allPics: document.querySelectorAll('img').length,
      htmlTail: ed.innerHTML.slice(-300),
    };
  });
  log('编辑器图片检查:', JSON.stringify(imgCheck));
  if (!imgCheck.imgs || !imgCheck.imgs.length) errors.push('编辑器内未插入图片');

  // ---------- 8.5 校验邮件正文含社招专属条款 ----------
  // 【社招】必须用「正式员工 - 福州」模板，正文才有离职证明/薪资证明/非中国国籍条款，
  //   称呼是「先生/女士」；校招版是「同学」且无离职证明要求 —— 用错模板这里能查出来。
  const bodyChk = await page.evaluate(() => {
    const eds = [...document.querySelectorAll('.wangEditor-txt')];
    const ed = eds[eds.length - 1];
    if (!ed) return { err: 'no editor' };
    const t = ed.innerText || '';
    return {
      len: t.length,
      head: t.slice(0, 60).replace(/\n+/g, ' '),
      liZhiMing: /离职证明/.test(t),
      xinZi: /薪资证明/.test(t),
      feiZhongGuo: /非中国国籍/.test(t),
      shangYiJia: /上一家工作单位/.test(t),
      xianSheng: /(先生\/女士|先生|女士)/.test(t),
      tongXue: /同学/.test(t),
      imgCount: ed.querySelectorAll('img').length,
    };
  });
  log('邮件正文校验:', JSON.stringify(bodyChk));
  if (bodyChk.err) {
    errors.push('正文校验失败: ' + bodyChk.err);
  } else {
    if (!bodyChk.liZhiMing) errors.push('正文缺「离职证明」条款 ⇒ 可能用了校招模板');
    if (!bodyChk.xinZi) errors.push('正文缺「薪资证明」条款 ⇒ 可能用了校招模板');
    if (!bodyChk.shangYiJia) errors.push('正文缺「上一家工作单位」条款 ⇒ 可能用了校招模板');
    if (bodyChk.tongXue) errors.push('正文出现「同学」⇒ 用的是校招模板，社招应为「先生/女士」');
    if (!bodyChk.xianSheng) errors.push('正文无「先生/女士」称呼');
  }

  // ---------- 9. 点「修改邮件内容」弹窗底部的「确定」 ----------
  // 注意：确定按钮属于「修改邮件内容」弹窗（标题含该文字），不是最内层的图片上传弹窗
  const okBtn3 = await page.evaluate(() => {
    const pops = [...document.querySelectorAll('.el-dialog, .el-modal, [role="dialog"]')].filter(d => {
      const r = d.getBoundingClientRect(); return r.width > 100 && r.height > 100;
    });
    // 找标题含「修改邮件内容」的弹窗
    for (const d of pops) {
      const title = ((d.querySelector('.el-dialog__title, .el-modal__title, [class*="title"]') || {}).innerText || '').trim();
      if (!/修改邮件内容/.test(title)) continue;
      const b = [...d.querySelectorAll('button')].find(x => {
        const t = (x.innerText||'').trim();
        return /^确定$/.test(t) && x.getBoundingClientRect().width > 0;
      });
      if (!b) continue;
      const br = b.getBoundingClientRect();
      return { x: Math.round(br.x + br.width/2), y: Math.round(br.y + br.height/2) };
    }
    return null;
  });
  if (okBtn3) {
    log(`  坐标点击「修改邮件内容」的确定 @(${okBtn3.x},${okBtn3.y})`);
    await page.mouse.click(okBtn3.x, okBtn3.y);
    await page.waitForTimeout(4000);
    log('已点「修改邮件内容」弹窗的「确定」');
  } else {
    errors.push('未找到「修改邮件内容」弹窗的确定按钮');
  }

  await shot(`${OUT}/offer-8-confirmed.png`);

  // ---------- 10. 最后的「发送Offer」按钮（默认不点）----------
  // ⚠ 该按钮在页面底部，locator.click() 点不中 → 必须用坐标点击
  const sendPos = await page.evaluate(() => {
    for (const el of document.querySelectorAll('button, .el-button')) {
      const t = (el.innerText || '').trim();
      if (t !== '发送Offer') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).display === 'none') continue;
      el.scrollIntoView({ block: 'center' });
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height) };
    }
    return null;
  });
  log('最终「发送Offer」按钮坐标:', JSON.stringify(sendPos));

  if (DO_SEND && sendPos) {
    // 滚动到按钮可见后再取坐标（scrollIntoView 会改变位置）
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, .el-button')) {
        if ((el.innerText || '').trim() === '发送Offer') { el.scrollIntoView({ block: 'center' }); return; }
      }
    });
    await page.waitForTimeout(1200);
    const pos2 = await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, .el-button')) {
        if ((el.innerText || '').trim() !== '发送Offer') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
      return null;
    });
    const P = pos2 || sendPos;
    log(`>>> 坐标点击「发送Offer」@(${P.x},${P.y})`);
    await page.mouse.click(P.x, P.y);
    await page.waitForTimeout(5000);

    // 发送后可能还有确认弹窗 → 坐标点确定
    for (let i = 0; i < 4; i++) {
      const dlg = await findDialog();
      if (!dlg) break;
      log(`  发送后弹窗${i + 1}: ${dlg.text}`);
      log(`  坐标点击确定 @(${dlg.x},${dlg.y})`);
      await page.mouse.click(dlg.x, dlg.y);
      await page.waitForTimeout(3500);
    }

    const msgs = await page.evaluate(() => [...document.querySelectorAll('.el-message,.el-notification')].map(e => e.innerText.trim()).filter(Boolean));
    console.log('提示:', JSON.stringify(msgs));
    // 验证：是否已离开发送页 / 按钮是否变化
    const after = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, .el-button')].map(b => (b.innerText || '').trim()).filter(Boolean);
      return { url: location.href, btns: btns.slice(0, 20) };
    });
    console.log('发送后 URL:', after.url);
    console.log('发送后按钮:', JSON.stringify(after.btns));
    await shot(`${OUT}/offer-9-sent-${NAME}.png`);
  } else {
    log('>>> 停在「发送Offer」之前，未发送');
  }

  console.log('\n=== 状态 ===');
  console.log('URL:', page.url());
  console.log('IMG:', IMG);
  console.log('DO_SEND:', DO_SEND);
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  - ' + e)); }
  else console.log('✓ 无错误');

  await browser.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
