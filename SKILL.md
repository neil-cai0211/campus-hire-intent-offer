---
name: campus-hire-intent-offer
description: 校招录用审批、录用意向书与offer发送助手。用于按公司五套Word模板生成录用意向书PDF（技术职能类、销售通用类、品牌营销类、其他类、销售外派类）、计算告知有效期并转成可插入邮件的高清图、在薪人薪事系统改动offer表单（入职日期、抄送邮箱、邮件模板）并最终发送offer。不负责简历筛选与面试安排、不负责薪酬方案设计、不负责劳动合同签署。
---

# 校招录用审批 · 录用意向书 · offer 发送

## 边界

1. 本Skill处理候选人从「录用审批」到「offer 已发出」的完整闭环，覆盖**校招**与**社招（无需用人部门筛选）**两条链路。两条链路的字段口径、试用期、提交方式都不同，**先按下方表格分清**。不处理实习生流程、简历筛选、面试安排、背调与体检。
2. 录用审批只负责**提交**，不负责代Neil决定录用谁；薪酬方案、职级、汇报对象等业务口径由Neil给定，Skill只负责录入。
3. **录用意向书模板不复制进Skill**：一律引用公司目录 `D:\人力资源部文档分类（模板）\...\2-入职\` 下的原件。Skill保存的是「模板结构知识」（路径、字段口径、字符下标表），不是模板副本。模板会被公司更新（技术职能类模板 2026-10-21 已改过一次），副本会静默过期并导致填错位置。
4. **offer邮件是对候选人的外发内容，含薪酬与合同期**。发送前必须停下来给Neil确认，不得连续发送多份未经确认的offer。
5. **社招意向书与offer要等录用审批全部通过（审批人为 Neil）后才做**。审批未通过时入职日期可能变、offer表单还不能填。等 Neil 明确通知。
6. Skill保存通用规则、结构知识与调度入口；具体人员、薪酬、模板下标等属于运行配置，集中在 `config.js` 与 `people.js`，不写死在Skill里。
7. 不讨论绩效评分、奖金换算、人员排名。

## 按场景读取参考

- **选模板、查字段口径、查某格填什么** → 读取 [模板结构与字段口径](references/templates.md)
- **生成录用��向书（社招 / 一人一档 / Neil 逐项口述）** → 读取 [链路二C 社招录用意向书](references/workflow-social-intent.md)
  ⚠ 该文档含「要问 Neil 的 11 项」清单、配置 JSON 格式、**管理序列 75/5/20 的比例坑**、留空模式。
  🔴 **提问方式（Neil 2026-11-13 明确偏好）**：连着不间断地**选项式**问，一次 3–4 题用 `AskUserQuestion` 点选，
  一批答完立刻接下一批；**不要一次性列文字清单让 Neil 打字填**，也不要一题一答中间插探查。
  试用期收入比例必须单独一题，不可与拆分比例合并。
  ⚠ 生成后**必须裁四段图核验**（脚本报成功 ≠ 内容对）。
- **提交录用审批（校招）** → 读取 [链路一 录用审批](references/workflow-approval.md)
- **提交录用审批（社招 / 无需用人部门筛选）** → 读取 [链路一B 社招录用审批](references/workflow-social-approval.md)
  ⚠ 该文档开头的「填写顺序」章节是**必读**，字段之间有依赖，顺序错了不报错但会跑出残缺表单。
- **审批提交后提醒审批人（钉钉）** → 读取 [钉钉审批提醒环节](references/dingtalk-approval-reminder.md)
  ⚠ 这是审批链路的**标准最后一步**，校招/社招都适用；收件人取卡片状态里的「当前审批人」。
  🔴 **发送身份是 Neil 本人（`--as user`，带「AI 发送」角标），不是机器人**；发送前必须 `--dry-run` 预览并给 Neil 确认。
  🔴 **称呼只叫英文名**（Neil 2026-11-13 定）：取显示名 `中文名(Ivy X)` 里的 `Ivy`；
  **删掉「老师」**，不要中文名/简称、不要带姓、不要职务。取不到英文名先问 Neil。
- **社招走录用意向书 + offer** → 读取 [链路二B/三B 社招意向书与offer](references/workflow-social-intent-offer.md)
- **要跑社招 offer 一站式脚本（填表→预览→插图→发送）** → 读取 [社招 offer 一站式脚本](references/workflow-social-offer-onespass.md)
  ⚠ 该文档含**最危险的坑**：预览时可能弹「必审字段被修改，将重新审批offer」——**必须点「取消」**，点「确定」会发起审批导致 offer 发不出去。
- **生成录用意向书PDF与插图** → 读取 [链路二 录用意向书](references/workflow-intent.md)
- **改offer表单并发送** → 读取 [链路三 offer发送](references/workflow-offer.md)
- **脚本报错、图模糊、脚本卡死、生成结果异常** → 读取 [踩坑与故障排查](references/pitfalls.md)
- **要判断 offer 到底发出去了没** → 读 pitfalls 的「判断 offer 是否真的发出」一节（**别看列表页的发送时间列，是空的，会误判**）
- **需要精确的字符下标表** → 读取 `references/template-slots.json`（五套模板 × 62 个单元格的槽位结构，机器解析所得）
- **模板被公司更新过** → 按下方「模板结构维护」三步更新

## 模板结构维护（模板被公司改动时）

模板一改，字符下标会整体漂移，而生成流程**不会报错**——只会静默填错位置。必须走这三步：

```bash
cd scripts
# 1) dump 模板结构（输出到 scripts/template-dump.txt）
powershell -NoProfile -ExecutionPolicy Bypass -File dump-template.ps1 -Template "<模板绝对路径>"
# 2) 解析出槽位（机器提取，比手抄可靠）
node parse-slots.js "<dump文件>" "<slots-xxx.json>"
# 3) 交叉校验 config.js 的 fills 是否仍与模板对齐
node verify-slots.js
```

`verify-slots.js` 会输出每套模板的填位对齐情况；**任何一条不一致都必须先修 config.js 再生成**。

> ⚠ **JavaScript 的注释是 `//` 和 `/* */`，不是 `#`**。写脚本时用 `#` 当注释会报 `SyntaxError: Invalid or unexpected token`（且报错点在第 1 行，容易误判成编码问题）。


## 场景识别

- **提交录用审批**：用户说"XX 发录用审批"、"帮 XX 走审批"、"提交录用审批"。
- **社招录用审批**：同���，但候选人来自「无需用人部门筛选」流程、或候选人**资历为社会招聘**（有工作经历）。**字段口径与校招完全不同**，必须走链路一B。
- **生成录用意向书**：用户说"给 XX 生成录用意向书"、"XX 的意向书"、"意向书模板不一样"。
- **发送offer**：用户说"XX 到offer环节了"、"发offer"、"offer要不要停"。
- **口径核对**：用户问"XX 的合同期限怎么算"、"固定部分怎么拆"、"有效期到几号"。**只答不改**。
- **故障排查**：脚本报错、图模糊、Word卡死、Chrome连不上。

## 校招 vs 社招：先分清是哪条链路

| | 校招（链路一） | **社招（链路一B）** |
|---|---|---|
| 流程条 | 简历初筛 → 考试 → 测评 → 用人部门筛选 → 面试 → 录用审批 → offer | 简历初筛/人才推荐 → 面试 → 录用审批 → offer → 背调 |
| 前置条件 | 用人部门筛选通过 | **面试通过 + 面试评价全部结束** |
| 试用期 | 6 个月 | **销售 6 个月 / 其他 3 个月** |
| 薪资字段 | 三项 | **转正前 + 转正后两套，共 6 项** |
| 入职部门 | 部门下拉 | **自由文本框**（按 `config.js` 的 `jobDeptMap` 映射） |
| 薪酬比例 | 技术线 80/5/15 | 通用 80/5/15；销售线与品牌营销线（平面设计师除外）95/5 |
| 提交 | 提交后两个弹窗 | **点页脚「确定」→ 弹窗「提交审批」→ 弹窗内再点「确定」**（两段式） |

**判不准就问用户是校招还是社招** —— 两条链路的口径不能混用。

## 核心红线

1. **告知有效期必须动态计算**：录用意向书上的「本通知书有效日期至」要与 offer 表单的「offer有效期」字段一致。N天 = 从发送当天起算、**含当天**。例：offer有效期填3，10-29发送 → 10.29/10.30/10.31 → 填2026年10月31日。**禁止写死日期**。用 `valid-date.js`（工作区），跨天发送用 `OFFER_BASE_DATE=YYYY-MM-DD` 指定起算日。
2. **下划线是字符级Underline格式**，不是下划线字符。只能用字符级Range替换（收集绝对位置 → 按Pos降序替换），格式自动继承。**禁止整段重写或用Range.Text覆盖整行**。
3. **发送前必须停下**。offer是外发给候选人的，含薪酬数字与合同期。
4. **只用字符级替换处理带下划线的数字**。技术模板的告知有效期原文「2026年10月23日」与入职日期原文同在文档中，用Find/Replace会串改。
5. **推送 GitHub 前必须先自检并把「待 Neil 确认」放在最前面**。自检 7 项：脱敏、凭证扫描、私密文件已排除、脱敏后功能仍可用、commit message 有正文、仓库可见性正确、推送后验证远端。详见 [交付前确认与推送规范](references/push-protocol.md)。
6. **社招录用审批的字段填写顺序是硬约束**。顺序错了不报错，但会跑出残缺表单（薪酬只有 3 个框 / 入职部门被清空 / 提交时字段为空）。**优先用 CDP 版脚本** `cdp-approval.js`（一人一档 JSON 配置 + 顺序写死 + 12 步自检 + `--resume` 断点续跑），别手写；旧 `fill-approval-social.js` 是 playwright 版，已停用。手工填也必须按 reference 里的 12 步顺序，三条最关键：试用期**第一个**填（否则薪酬区不展开成两套）、入职部门**最后**填（否则被联动覆盖）、填表与提交**必须一站式**（草稿不保存，刷新即丢）。详见 [链路一B 社招录用审批](references/workflow-social-approval.md)。
7. 🔴 **薪酬口径以「已生成的录用意向书」+ Neil 当时的逐项确认为准，禁止套通用比例**。通用 80/5/15「试用期无绩效」只是缺省值；个案可能是 `试用期 100%（不打折）`，此时试用期三项与转正后完全相同（绩效照填），合计 = 满额；也可能是 `试用期 85%（不发绩效）`，如某社招候选人「满额 × 85% = 基本+保密，绩效填 0」。2026-11-13 某管理序列社招审批就因套用缺省值把试用期合计少填了一档绩效并提交了。**填薪酬前必须先读该候选人意向书配置（`R9C2` 试用期比例 / `R10C2` 满额 / `R13C2-4` 拆分），把比例当显式字段写进配置，并在提交前单独向 Neil 报一次「试用期合计」。** 详见 [链路一B 薪酬章节](references/workflow-social-approval.md)。
8. 🔴 **合同主体会静默筛掉入职部门树**，填表前先确认目标一级线在该主体白名单内。福州誉龙只放行 `R&D` / `CS`；成都先锋寰宇放行全部 7 条线；**留空也是完整 7 条线**。Neil 2026-11-13 对某社招候选人定过特例口径「无需添加合同」⇒ 合同主体留空提交（label 无必填星号，实测通过）。详见 [链路一B 第 8 条](references/workflow-social-approval.md)。

## 执行位置

| 内容 | 路径 |
|---|---|
| 工作脚本 | `D:\AI-Workspace\录用意向书\`：**`cdp-approval.js`**（社招录用审批·CDP 版）、**`cdp-offer-social.js`**（社招 offer·CDP 版·`--send`／`--resume`，配套 `cdp-lib.js` + `cdp-offer-helpers.js`），一人一档 `<姓名>-approval.json` / `<姓名>-offer.json`；people.js / valid-date.js / gen-intent*.js / crop-pdf.js。<br>转图用 skill 内 **`scripts/make-insert-pymupdf.py`**。<br>🔴 **playwright 版全部停用**（2026-11-13 卸载 playwright-core）：`offer-onepass-social.js` 只作业务底本参考、`make-insert-png.js` / `fill-approval-social.js` / `send-offer.js` / `send-all.js` 不再可直接运行 |
| 意向书PDF | `D:\AI-Workspace\录用意向书\out\` |
| 邮件插图 | `D:\AI-Workspace\录用意向书\out-png\`（3176宽JPEG q=90） |
| 日志 | `D:\AI-Workspace\录用意向书\logs\` |
| 模板原件 | `D:\人力资源部文档分类（模板）\01招聘调配\01表格模板\入离调转流程及表单\2-入职\` |
| 浏览器调试 | **Web Access CDP Proxy**：日常 Chrome 勾选远程调试 → `DevToolsActivePort`(9222) → 代理 `127.0.0.1:3456`；旧 9333 独立实例已停用 |

**Skill只做索引与调度，不搬移工作脚本**——脚本之间有引用链（people.js 被 send-all.js 等依赖），搬动会打断。

## 环境前置

1. **浏览器自动化 = Web Access（CDP Proxy），不用 playwright**（2026-11-13 切换，playwright-core 已卸载）：
   - 日常 Chrome 打开 `chrome://inspect/#remote-debugging` → 勾选 `Allow remote debugging for this browser instance` ⇒ 生成 `DevToolsActivePort`（默认 9222）
   - 常驻代理：`node ~/.workbuddy/skills/web-access/scripts/cdp-proxy.mjs --browser chrome`（监听 `127.0.0.1:3456`）
   - 脚本用 HTTP `/eval?target=`、`/navigate?target=`、`/new`、`/targets` 操作；`config.env` 里固定 `WEB_ACCESS_BROWSER=chrome`
   - 用**日常 profile** ⇒ 登录态天然在，不用扫码、不用独立 9333 实例
   - ⚠ `/eval` 返回空不等于没执行，重跑前先读页面状态（详见 [踩坑 三](references/pitfalls.md)）
   - 旧的 `start-chrome.sh` / `ChromeCDPGuard` / 9333 端口方案**已停用**
2. Word COM 可用。生成意向书前先清掉残留WINWORD进程与Word恢复记录，否则 `Documents.Open` 会静默挂死（见 pitfalls.md）。
3. 社招录用审批脚本：`D:\AI-Workspace\录用意向书\cdp-approval.js`（CDP 版，`--send` 才提交）：
   - **一人一档**：`CDP_CONFIG=<绝对路径>/<姓名>-approval.json`，薪酬六项与试用期比例逐人显式写，禁止套通用值；
   - `--resume --send`：`/eval` 报超时后从断点继续（超时 ≠ 没执行，先读回快照）；
   - 旧 `fill-approval-social.js`（playwright 版）已停用。
4. **PDF → 插图**用 `python scripts/make-insert-pymupdf.py --names "<outName>"`（PyMuPDF 2.0 + Pillow，本机已装）。
   旧 `make-insert-png.js` 依赖已卸载的 playwright-core 与 cdnjs，**不要再用**。
