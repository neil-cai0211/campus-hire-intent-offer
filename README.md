# campus-hire-intent-offer

校招 **录用审批 → 录用意向书 → offer 发送** 全链路的操作 Skill。

面向 WorkBuddy / Codex 等本地 Agent，把这套流程固化成可复用的步骤、字段口径与避坑清单，
避免每次重踩 Word COM 静默挂死、ps1 编码、Chrome 调试端口等坑。

## 三条链路

| 链路 | 产出 | 完成判据 |
|---|---|---|
| 一 · 录用审批 | 候选人进入审批 | 状态标签「审批中」 |
| 二 · 录用意向书 | 意向书 PDF + 邮件插图 | PDF 生成、插图 3176 宽 JPEG ≤2MB |
| 三 · offer 发送 | 候选人收到 offer | 卡片按钮变「重发Offer」 |

链路二、三串行：必须先有插图，才能插入 offer 邮件。

## 目录

```
SKILL.md                      入口：边界、场景识别、核心红线
config.js                     五套模板路径 + 字符下标表 + 版本指纹 + 业务口径
config.local.example.js       本机私密值模板（复制为 config.local.js）
references/templates.md       模板结构差异、字段口径、有效期动态规则
references/workflow-approval.md   链路一
references/workflow-intent.md     链路二
references/workflow-offer.md      链路三
references/pitfalls.md        各类故障排查
scripts/dump-template.ps1     模板结构分析器（模板更新后重取下标）
scripts/list-people.js        人员清单 + 口径缺口 + 模板版本校验
```

## 四条核心红线

1. **告知有效期必须动态计算** —— 与 offer 表单的「offer有效期」一致，N 天从发送当天起算含当天。禁止写死。
2. **下划线是字符级 Underline 格式** —— 只能用字符级 Range 替换（收集位置 → 降序替换），禁止整段重写。
3. **发送前必须停下确认** —— offer 是外发给候选人的内容，含薪酬与合同期。
4. **只用字符级替换处理带下划线的数字** —— Find/Replace 会串改。

## 安装

```bash
cp config.local.example.js config.local.js   # 填入真实值
# 编辑 config.js 的 TEMPLATE_DIR / WORKSPACE，或设环境变量
```

依赖：Word COM（生成意向书）、Chrome CDP 9333（跑 offer 链路）、Node + playwright-core。

## 模板不复制

本 Skill **不包含** Word 模板副本，一律引用公司原件目录。模板会被更新，
副本会静默过期并导致填错位置。`config.js` 里记录了版本指纹，生成前会校验，
不一致时用 `scripts/dump-template.ps1` 重取结构。
