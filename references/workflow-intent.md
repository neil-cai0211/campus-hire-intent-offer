# 链路二 · 录用意向书

**目的**：按公司模板生成带下划线的意向书PDF，并转成可插入邮件的高清图。
**产出**：`out\<姓名>-<院校>-<岗位>.pdf` + `out-png\<同名>.jpg`（3176宽，≤2MB）

## 步骤

| # | 操作 | 关键点 |
|---|---|---|
| 1 | **选模板** | 五套结构不同，见 templates.md。销售岗用 `sales`，其余技术/职能岗用 `tech` |
| 2 | **取数** | 录用审批的岗位/职级/部门/汇报对象 + 薪酬拆分。⚠ **卡片应聘职位与offer表单岗位可能相反 → 以offer表单为准** |
| 3 | 写 `people.js` | 一人一条记录，见下方字段 |
| 4 | **算有效期** | `valid-date.js`，**必须动态**，见 templates.md |
| 5 | 生成PDF | `node gen-intent.js '<cfgJSON>'`（技术）/ `node gen-intent-sales.js '<cfgJSON>'`（销售） |
| 6 | 转高清图 | `node make-insert-png.js` |
| 7 | **校验** | `node crop-pdf.js <pdf> <out前缀> "x%,y%,w%,h%"` 裁剪放大逐项核对，**不能只看整图** |

## people.js 字段

```js
{
  no: 13, name: '刘昊', phone: '',
  job: '初级技术支持专员',      // 职位/职级名称
  jobCn: '技术支持专员',        // 卡片匹配用的岗位关键字
  location: '福建福州及您参与的项目或工作任务所涉及的区域',
  dept: '技术支持组', boss: '经理', bossName: '<汇报对象姓名>',
  school: '福州大学',
  probMonths: 6, probInc: '5100', fullInc: '6000',
  basic: '4800', secret: '300', perf: '900',   // 按模板比例拆
  outName: '刘昊-福州大学-技术支持专员',
  skipApproval: true,        // 录用审批已通过，只走链路二/三
  template: 'tech',          // 'tech' | 'sales'
  // 销售模板额外需要：
  year:'2027', month:'7', day:'1',
  endYears:'3', endMonth:'9', endDay:'30',
  validYear:'2026', validMonth:'10', validDay:'31',
  contact:'<HR联系人>', contactPhone:'<手机号>',
}
```

`year/month/day/endYears/endMonth/endDay/valid*` 由 `valid-date.js` 与统一补齐逻辑自动挂载，**不要手写死**。

## 执行

```bash
cd "D:/AI-Workspace/录用意向书"
export NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules"
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY

# 单人
node gen-intent.js '<cfgJSON>'            # 技术模板
node gen-intent-sales.js '<cfgJSON>'       # 销售模板

# 批量（全部13人）
node make-insert-png.js                   # 插图批量生成
```

跨天发送时：`OFFER_BASE_DATE=2026-10-30 node gen-intent.js '<cfgJSON>'`

## 图片清晰度

| 方案 | 尺寸 | 体积 | 效果 |
|---|---|---|---|
| 1600 PNG（旧） | 1600×2263 | 1088KB | ❌ 文字发虚 |
| 2400 PNG | 2400×3395 | 1969KB | ✅ 清晰 |
| **3176 JPEG q=90（现用）** | **3176×4493** | **1792KB** | ✅ **最锐利，黑白文字无可见压缩伪影** |

做法：pdf.js **scale=12** 渲染（PDF是矢量，放大不损）→ 派生 3176 宽 JPEG q=90。约束是邮件图片上传 **≤2MB**。薪资人薪事的上传控件**接受 jpg**。

## 坑

- **Word `Documents.Open` 静默挂死**（详见 pitfalls.md）——表现为脚本无输出、被 SIGTERM
- **ps1 必须纯 ASCII**——含中文注释也会让 PS 5.1 按 GBK 解析而语法报错。生成脚本已加自动校验
- **禁止整段重写**——下划线是字符级格式
- **技术模板的「23日」在 R5C2 与 R16C2 重复出现**——用 Find/Replace 必串改，已全部改造成字符级替换
- **意向书先生成、offer后发送**——跨天时有效期会对不上，必须用发送日重跑
