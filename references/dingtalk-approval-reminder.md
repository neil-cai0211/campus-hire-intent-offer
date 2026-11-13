# 标准环节 · 审批提交后用钉钉提醒当前审批人（Neil 本人身份）

Neil 2026-11-13 要求加入：**录用审批提交成功并核验状态后，立刻以 Neil 本人身份
在钉钉发一条提醒给当前审批人**。消息会显示「AI 发送」角标（`--ai-tag` 默认 true）。

🔴 **不要用机器人身份发**。Neil 2026-11-13 明确纠正：
「发送身份是我的，不用机器人」「就是我发的，会显示AI发送」。
曾误用一次 `--as bot` 发出，已用 `recall-by-bot` 撤回并以本人身份重发。

🔴 **称呼只叫英文名**（2026-11-13 Neil 第二次修正）：「后续提醒，把老师删掉就叫英文就行了，
比如 Ivy」。不要「XX老师」、不要中文名/中文简称、不要带姓。取显示名括号里英文名的第一个词，
细则见下方「文案模板」。此口径**覆盖**本文件早期写的中式称呼（中文名+老师），别再沿用。

校招（链路一）与社招（链路一B）都适用。

## 触发时点与收件人

- **触发**：卡片状态核验为「录用审批 | **审批中** | `<当前审批人>`」之后立即执行。
  提交动作本身不算完成 —— 必须先看到状态标签。
- **收件人**：状态标签里的**当前审批人**，不是审批链全体、不是固定名单、不是 Neil 本人。
  审批链每往下走一人，才提醒下一人（Neil 另有指令除外）。
- 不要在审批还没提交、或提交失败时发提醒。

## 操作步骤

```bash
# 1) 解析当前审批人的 userId（只读）
dws contact user search --query "<当前审批人姓名>"
#    → 取唯一结果的 userId（⚠ 不是 openDingTalkId）

# 2) 预览（必做；--dry-run 不会真的发）
dws chat +messages-send --dry-run --as user \
  --user "<userId>" \
  --title "录用审批提醒" \
  --markdown "<文案>"

# 3) 把预览内容给 Neil 确认后，去掉 --dry-run、加 -y 真发
dws chat +messages-send -y --as user --user "<userId>" \
  --title "录用审批提醒" --markdown "<文案>"

# 4) 查投递状态（拿到 sendStatus=SUCCESS 与 openMessageId 才算完成）
dws chat message query-send-status --open-task-id "<openTaskId>"
```

也可用 `dws chat +dm --to "<姓名>" --content "<文案>"`（同样是本人身份，自动按姓名解析），
但它把整段正文当通知标题，长文案显示不美观 ⇒ 优先 `+messages-send`。

发完回报**发送回执**：`sendStatus=SUCCESS` + `openMessageId`。

## 文案模板

```
标题：录用审批提醒

<英文称呼>，<候选人姓名>的录用审批已发起，当前审批人是你，麻烦审批一下。

岗位：<岗位>（<职级>）｜部门：<部门>｜入职日期：<日期>
```

- 🔴 **称呼只叫英文名，不加「老师」、不带姓、不带职务**（Neil 2026-11-13 修正）。
  此条**覆盖**本文件早期写的「大鹏老师」口径 —— 那版已被 Neil 否决，别再沿用。
  取法：EHR 卡片/审批人显示名格式是 `中文名(英文名 姓)`，取括号内**第一个词**：

  | 显示名（EHR 卡片格式） | 正确称呼 | 错误叫法 |
  |---|---|---|
  | `中文名(Ivy X)` | `Ivy` | `Ivy 老师` / `Ivy X` / `中文名+老师` |
  | `中文名(<英文名> <姓>)` | `<英文名>` | 中文名+老师 / 中文名简称 / 英文名+姓 |

  ✅ `Ivy，XX的录用审批已发起…`　✅ `<英文名>，麻烦审批一下`
  ❌ 中文全名、中文简称、`XX老师`、`XX总`、英文名带姓。
  （`Ivy` 是 Neil 给的口径示例；文档不落真实姓名，实际显示名从 EHR 卡片读。）
- 显示名是纯中文、取不到英文名时，**先问 Neil 一句再发**，别自造音译、别按中文名猜。
- 撤销后重提时写「已**重新发起**」。
- 🔴 **不要写薪酬、身份证、手机号、邮箱** —— 钉钉消息会被转发/截图，
  薪酬属必审字段且是敏感信息。
- Markdown 换行要用**空行**（`\n\n`），单个 `\n` 在钉钉里不换行。
- 保持简短。Neil 给过的最短一句式是「<称呼>审批一下」；
  按新口径即 `Ivy，麻烦审批一下`（英文称呼 + 一句话）。岗位/日期只是帮审批人定位，
  不要展开成审批单。
- `--dry-run` 预览给 Neil 确认时，文案就用上面这套称呼，不要预览写「老师」、真发再改。

## 参数与身份坑

| 坑 | 说明 |
|---|---|
| 🔴 **必须 `--as user`（默认身份）** | 用机器人会显示成「Neil的机器人」，Neil 不要这个；`--as bot`、`send-by-bot`、`+messages-send --as bot` 一律别用 |
| **AI 发送角标** | `--ai-tag` 默认 true ⇒ 消息带「AI 发送」标记，这正是 Neil 要的效果，**别关掉** |
| user 单聊用 `--user`（userId）或 `--open-dingtalk-id` | `--users` / `--open-dingtalk-ids` 是 bot 批量参数，user 传了会报错 |
| `userId` ≠ `openDingTalkId` | 通讯录两个字段都在，别拿错 |
| 姓名命中多人 | **停下来问 Neil**，不要按第一个猜 |
| token 显示 `expired` 不等于不可用 | refresh token 有效时调用会自动刷新，别据此判死 |
| 重发会刷屏 | 同一轮审批只提醒一次；只有「撤销后重提」才算新一轮 |
| 误发机器人消息可撤回 | `dws chat message recall-by-bot --robot-code <code> --keys <processQueryKey>`（单聊只传 `--keys`）；processQueryKey 来自机器人发送回执 |

## 前置环境

- `dws` CLI：`C:\Users\huiji\bin\dws.exe`（已在用户 PATH）
- profile：ZBS POS CORP / 蔡宇航(Neil Cai)，用 `dws profile list` 确认
- 本机 PATH 顺序：`.sandbox-bin` → `C:\Users\huiji\bin` → 托管 Node 目录最后
  （Node 目录里有 `dws.ps1`，PowerShell 会优先选它并被策略拦）
