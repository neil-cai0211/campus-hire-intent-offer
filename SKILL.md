---
name: campus-hire-intent-offer
description: 校招录用审批、录用意向书与offer发送助手。用于按公司五套Word模板生成录用意向书PDF（技术职能类、销售通用类、品牌营销类、其他类、销售外派类）、计算告知有效期并转成可插入邮件的高清图、在薪人薪事系统改动offer表单（入职日期、抄送邮箱、邮件模板）并最终发送offer。不负责简历筛选与面试安排、不负责薪酬方案设计、不负责劳动合同签署。
---

# 校招录用审批 · 录用意向书 · offer 发送

## 边界

1. 本Skill处理校招候选人从「录用审批」到「offer 已发出」的完整闭环。不处理社招、实习生、外派等非校招流程，也不处理简历筛选、面试安排、背调与体检。
2. 录用审批只负责**提交**，不负责代Neil决定录用谁；薪酬方案、职级、汇报对象等业务口径由Neil给定，Skill只负责录入。
3. **录用意向书模板不复制进Skill**：一律引用公司目录 `D:\人力资源部文档分类（模板）\...\2-入职\` 下的原件。Skill保存的是「模板结构知识」（路径、字段口径、字符下标表），不是模板副本。模板会被公司更新（技术职能类模板 2026-10-21 已改过一次），副本会静默过期并导致填错位置。
4. **offer邮件是对候选人的外发内容，含薪酬与合同期**。发送前必须停下来给Neil确认，不得连续发送多份未经确认的offer。
5. Skill保存通用规则、结构知识与调度入口；具体人员、薪酬、模板下标等属于运行配置，集中在 `config.js` 与 `people.js`，不写死在Skill里。
6. 不讨论绩效评分、奖金换算、人员排名。

## 按场景读取参考

- **选模板、查字段口径、查某格填什么** → 读取 [模板结构与字段口径](references/templates.md)
- **提交录用审批** → 读取 [链路一 录用审批](references/workflow-approval.md)
- **生成录用意向书PDF与插图** → 读取 [链路二 录用意向书](references/workflow-intent.md)
- **改offer表单并发送** → 读取 [链路三 offer发送](references/workflow-offer.md)
- **脚本报错、图模糊、脚本卡死、生成结果异常** → 读取 [踩坑与故障排查](references/pitfalls.md)
- **模板被公司更新过** → 先跑 `scripts/dump-template.ps1` 重新取结构，再更新 `config.js`

## 场景识别

- **提交录用审批**：用户说"XX 发录用审批"、"帮 XX 走审批"、"提交录用审批"。
- **生成录用意向书**：用户说"给 XX 生成录用意向书"、"XX 的意向书"、"意向书模板不一样"。
- **发送offer**：用户说"XX 到offer环节了"、"发offer"、"offer要不要停"。
- **口径核对**：用户问"XX 的合同期限怎么算"、"固定部分怎么拆"、"有效期到几号"。**只答不改**。
- **故障排查**：脚本报错、图模糊、Word卡死、Chrome连不上。

## 核心红线

1. **告知有效期必须动态计算**：录用意向书上的「本通知书有效日期至」要与 offer 表单的「offer有效期」字段一致。N天 = 从发送当天起算、**含当天**。例：offer有效期填3，10-29发送 → 10.29/10.30/10.31 → 填2026年10月31日。**禁止写死日期**。用 `valid-date.js`（工作区），跨天发送用 `OFFER_BASE_DATE=YYYY-MM-DD` 指定起算日。
2. **下划线是字符级Underline格式**，不是下划线字符。只能用字符级Range替换（收集绝对位置 → 按Pos降序替换），格式自动继承。**禁止整段重写或用Range.Text覆盖整行**。
3. **发送前必须停下**。offer是外发给候选人的，含薪酬数字与合同期。
4. **只用字符级替换处理带下划线的数字**。技术模板的告知有效期原文「2026年10月23日」与入职日期原文同在文档中，用Find/Replace会串改。

## 执行位置

| 内容 | 路径 |
|---|---|
| 工作脚本 | `D:\AI-Workspace\录用意向书\`（people.js / valid-date.js / gen-intent*.js / send-offer.js / send-all.js / make-insert-png.js / crop-pdf.js） |
| 意向书PDF | `D:\AI-Workspace\录用意向书\out\` |
| 邮件插图 | `D:\AI-Workspace\录用意向书\out-png\`（3176宽JPEG q=90） |
| 日志 | `D:\AI-Workspace\录用意向书\logs\` |
| 模板原件 | `D:\人力资源部文档分类（模板）\01招聘调配\01表格模板\入离调转流程及表单\2-入职\` |
| Chrome调试实例 | profile `D:\AI-Workspace\cdp-profile`（**必须纯ASCII路径**），端口9333 |

**Skill只做索引与调度，不搬移工作脚本**——脚本之间有引用链（people.js 被 make-insert-png.js / send-all.js 依赖），搬动会打断。

## 环境前置

1. Chrome调试实例必须运行（脚本用CDP连接，需登录态）：
   ```bash
   bash "D:/AI-Workspace/校招审批/start-chrome.sh"
   ```
   或靠计划任务 `ChromeCDPGuard` 每分钟自愈。**端口不通时脚本报 `connect ECONNREFUSED 127.0.0.1:9333`**。
2. Word COM 可用。生成意向书前先清掉残留WINWORD进程与Word恢复记录，否则 `Documents.Open` 会静默挂死（见 pitfalls.md）。
3. Node 依赖 `playwright-core`：`NODE_PATH=$HOME/.workbuddy/binaries/node/workspace/node_modules`。
