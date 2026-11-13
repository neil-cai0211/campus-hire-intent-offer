# 链路三 · offer 发送

> ⚠ **本文档是校招/playwright 时代的操作记录，命令已不可直接执行**（2026-11-13 卸载 playwright-core）。
> 现行社招 offer 走 `cdp-offer-social.js`，见 [社招 offer 一站式脚本（CDP 版）](workflow-social-offer-onespass.md) 开头章节。
> 下面的 DOM 坑点与**产出判据**仍然有效，但判据以「详情页 offer 记录区待确认 + 到期时间 + 发起时间」为准，
> 不能只看按钮变「重发Offer」。

**目的**：改 offer 表单字段、插入意向书图、发送。
**产出判据**：卡片按钮从「发送Offer」变为「**重发Offer**」，流程阶段进入 offer。

## 步骤

| # | 操作 | 关键点 |
|---|---|---|
| 1 | 进 offer 环节 | 列表页 → 流程条「offer」 |
| 2 | 点卡片「发送Offer」 | ⚠ **hover 才显示**，locator 点击报 `element is not visible` → **坐标点击**（hover 后取中心点） |
| 3 | 改入职日期 | **2027/07/01**（与录用审批的 06/01 不同，是 Neil 定的口径） |
| 4 | 选抄送邮箱 | **HR 本人**（必选）。见下方说明 |
| 5 | 预览 offer | 弹「已超出设定编制…」→ **坐标点确定**。技术支持组有预增，不一定弹 |
| 6 | 选邮件模板 | 「校招」 |
| 7 | 插入图 | 「修改邮件」→ 图片按钮 → 「或点击上传」→ 上传（**自动插入**，无按钮）。页面上有 **2 个 file input**，别选错 |
| 8 | 点确定 | 「修改邮件内容」弹窗的确定 |
| 9 | **发送** | ⚠ **两个坐标点击**，见下 |

## 抄送邮箱（必选，有随机性）

- 组件结构：可编辑 input（搜索）+ 只读 input（展示）+ tag 列表
- **必须先点开下拉再输入**，直接 fill 无联想
- **选中后搜索 input 会被清空** → 校验要看 **tag 文本 / form-item 文本**，不能只看 input.value
- **有随机性**（有时联想列表不出现）→ 必做**重试，最多 4 次**
- 校验通过后应看到：`抄送邮箱： <姓名>(<英文名>) <邮箱>`（**必须含本人，否则没选中**）

## 发送：两个坐标点击

1. 页面底部的「发送Offer」按钮 → `scrollIntoView({block:'center'})` 后取中心点 → `page.mouse.click()`
2. **弹出的「确定发送offer吗?」→ 还要再点一次「确定」**

⚠ **漏掉第二步 = 根本没发出**。这是最容易白跑的地方。

## 执行

```bash
cd "D:/AI-Workspace/录用意向书"
export NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules"
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY

# 单人，先跑到发送前（给Neil检查）
node send-offer.js "姓名" "岗位关键字" "<插图绝对路径>"
# 单人，直接发送
node send-offer.js "姓名" "岗位关键字" "<插图绝对路径>" --send
# 批量（跳过 people.js 里 sent:true 的人）
node send-all.js --send
node send-all.js --send --only=刘昊,黎研
```

插图路径优先用 `.jpg`（高清版），回退 `.png`：`out-png\<outName>.jpg`

## 验证（比截图可靠）

页面有动画时 `page.screenshot` 会超时（waiting for fonts）。改用：

```js
// 从编辑器 HTML 取图片 URL（宽度3176 = 高清版已插入）
const url = await p.evaluate(() => {
  const im = [...document.querySelectorAll('img')].find(i => i.naturalWidth === 3176);
  return im ? im.src : null;
});
// 下载回来本地打开核对
```

**完成判据**：列表卡片按钮变成「重发Offer」。

## 坑

- **三个必须坐标点击**：卡片按钮 / 页面底部发送按钮 / 弹窗确定
- **发送后还有一道确认框**，漏点就白跑
- **同名多卡**——脚本按「岗位关键字 + 有发送Offer按钮」双重匹配，但仍要核对卡片上的岗位是否正确
- **技术支持组不触发超编弹窗**（编制 23/23 但有预增1），别误判成「弹窗没处理」
- **Chrome 必须挂在持续运行的后台任务里**——Bash 命令结束时进程被回收，CDP 断开
- **Chrome profile 必须纯 ASCII 路径**——含中文时 `--user-data-dir` 编码被破坏，Chrome 会附着到用户日常实例，调试端口不开
