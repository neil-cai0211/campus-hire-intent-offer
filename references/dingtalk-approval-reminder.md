# 标准环节 · 审批提交后用钉钉提醒当前审批人（Neil 本人身份）

Neil 2026-11-13 要求加入：**录用审批提交成功并核验状态后，立刻以 Neil 本人身份
在钉钉发一条提醒给当前审批人**。消息会显示「AI 发送」角标（`--ai-tag` 默认 true）。

🔴 **不要用机器人身份发**。Neil 2026-11-13 明确纠正：
「发送身份是我的，不用机器人」「就是我发的，会显示AI发送」。
曾误用一次 `--as bot` 发出，已用 `recall-by-bot` 撤回并以本人身份重发。

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

<审批人称呼>，<候选人姓名>的录用审批已发起，当前审批人是你，麻烦审批一下。

岗位：<岗位>（<职级>）｜部门：<部门>｜入职日期：<日期>
```

- **称呼按 Neil 给的口径**：例如「大鹏老师」，不要直呼全名、也不要简写成「大鹏」。
  没给过称呼的审批人先问一句再发（2026-11-13 Neil 明确要求）。
- 撤销后重提时写「已**重新发起**」。
- 🔴 **不要写薪酬、身份证、手机号、邮箱** —— 钉钉消息会被转发/截图，
  薪酬属必审字段且是敏感信息。
- Markdown 换行要用**空行**（`\n\n`），单个 `\n` 在钉钉里不换行。
- 保持简短，Neil 给过的最短口径是「大鹏审批一下」这种一句式；
  岗位/日期只是帮助审批人定位，不要展开成审批单。

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
