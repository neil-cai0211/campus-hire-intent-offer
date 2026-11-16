# 踩坑与故障排查

## 一、Word COM（生成意向书）

### 1. `Documents.Open` 静默挂死 ⚠ 最坑

**现象**：脚本跑着跑着没输出、被 SIGTERM，或 `gen-intent.js` 卡住不动。

**根因**：反复 `Stop-Process -Force` 强杀 WINWORD 会留下：
- 注册表 `HKCU:\Software\Microsoft\Office\16.0\Word\Resiliency`
- 自动恢复文件 `$env:APPDATA\Microsoft\Word\*.asd`

下次 Word 启动会弹**不可见的「文档恢复」窗格**（`Visible=false` 时看不到），`Documents.Open` 永不返回。

**解法**（生成前必做）：
```powershell
Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
try { Get-ChildItem "$env:APPDATA\Microsoft\Word" -Filter '*.asd' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Item 'HKCU:\Software\Microsoft\Office\16.0\Word\Resiliency' -Recurse -Force -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 2
```
⚠ **必须用 try/catch 包住**——路径不存在时 `Remove-Item` 报错，在 `$ErrorActionPreference='Stop'` 下会中断整个脚本。

### 2. 必须 ReadOnly=$true 打开

```powershell
$doc = $w.Documents.Open([string]$D.template, $false, $true)   # 第三参数 = ReadOnly
```
不需要写权限，也避开文件写锁引发的隐藏弹窗。改完照样能 `Range.Text` 赋值 + `ExportAsFixedFormat`。

### 3. 模板目录里的 `~$` 锁文件

`~$2 录用意向书_....doc` 是 Word 的 owner 文件，162字节。残留说明上次 Word 被强杀。
**清法**：在 Word 里正常打开该模板再关闭，Word 会自动删除（比手工删干净）。

### 4. 改字符时不能在枚举中修改

```powershell
foreach ($c in $rg.Characters) { $c.Text = 'x' }   # ❌ 会破坏 COM 枚举器
```
**正解**：先遍历收集绝对位置 → 排序 → 再用 `doc.Range(pos, pos+len)` 替换。
⚠ PowerShell 里 `$base + ($c.Start - $base)` 在数组上会报 `op_Addition` 错 → 用 `[PSCustomObject]` 收集。

### 5. 同一格多项替换要降序

替换会改变后续字符位置 → 先收集所有替换点 → **按 Pos 降序**替换。

## 二、PowerShell 脚本

### ps1 必须是纯 ASCII

**连中文注释都不行。** Node 用 `'ascii'` 编码写 ps1 时，中文注释变乱码 → PS 5.1 按 GBK 解析 → 语法错误。
生成脚本已加自动校验：`if (/[^\x00-\x7F]/.test(ps)) process.exit(4)`

ps1 里要匹配中文，用字符码：
```powershell
$greet = [string][char]0xFF1A + [string][char]0x60A8 + [string][char]0x597D   # ：您好
```

### JSON 传中文路径给 COM

`Get-Content -Raw -Encoding UTF8` 读 JSON → `ConvertFrom-Json` → 路径可用。**但 JSON 文件本身必须是 UTF-8**（不是 GBK）。

### 路径转义

Node 里写 Windows 路径：`'D:\\人力资源部\\...'`。多层转义（shell + JS + JSON）容易产生 `D:////` 这种四斜杠 → 用 Write 工具直接写 JSON 文件最稳。

### 执行策略

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File xxx.ps1`。直接 `& xxx.ps1` 会被策略拦。

### PowerShell 工具吞 stdout

用 PowerShell 工具跑长脚本时，stdout 可能拿不到。**把结果写文件再用 Read 读**。

## 三、Chrome / CDP

### 🔄 2026-11-13 起：改用 Web Access（CDP Proxy），playwright-core 已卸载

> 下面 9333 / `ChromeCDPGuard` / `start-chrome.sh` 那套**已停用**，仅留作历史参考。

**换方案的原因**：Chrome 自动升级 **156 → 157.0.8103.51**，本机 `playwright-core` 是 **1.56.0**，
`connectOverCDP` 在 **WebSocket 握手阶段**就被拒（`socket hang up`），Chrome 进程本身活着；
`launchPersistentContext` 能跑通（管道协议）但**登录态丢失**（Chrome 157 的 Cookies 加密机制变了，
从旧 profile 拷贝 `Cookies` 文件解不开）。Neil 决定换 `web-access` 技能并卸载 playwright-core
（包移到 `D:\AI-Workspace\_uninstalled-playwright-20261113`，可恢复）。

**新方案（在用的）**：

| 环节 | 做法 |
|---|---|
| 浏览器 | **日常 Chrome 实例**，不用独立 `--user-data-dir` profile ⇒ 登录态天然在，不用扫码 |
| 开调试 | Chrome 打开 `chrome://inspect/#remote-debugging`，勾选 `Allow remote debugging for this browser instance` ⇒ 自动生成 `%LOCALAPPDATA%\Google\Chrome\User Data\DevToolsActivePort`（本机 9222） |
| 代理 | `node ~/.workbuddy/skills/web-access/scripts/cdp-proxy.mjs --browser chrome` **常驻**在 `127.0.0.1:3456` |
| 脚本 | HTTP 调 `/eval?target=<id>`（POST body = JS 表达式）、`/navigate?target=`、`/new`、`/targets`、`/clickAt?target=`、`/health` |
| 固定偏好 | `~/.workbuddy/skills/web-access/config.env` 设 `WEB_ACCESS_BROWSER=chrome`（否则浏览器发现可能选错） |

工作脚本：`D:\AI-Workspace\录用意向书\cdp-approval.js`
（默认 dry-run；`--send` 才提交；`CDP_TARGET=<targetId>` 指定标签；旧 `fill-approval-social.js` 是 playwright 版，已停用）。

**这轮踩到的 8 个坑**：

1. **「没看到远程调试开关」往往是页面根本没打开** —— Chrome 当时只有一个别的标签。
   需新开标签手动导航到 `chrome://inspect/#remote-debugging`，开关就在页面里。
2. **单次 `/eval` 执行过久会超时** ⇒ 重试循环放 **Node 调用侧**，不要写在页面内的 async 里。
3. 🔴 **`/eval` 返回空（`PROXY: `）≠ 命令没执行** —— 提交弹窗那步实际已 `btn.click()` 成功、
   页面已跳回列表，只是响应丢了。此时**必须先读页面状态再决定是否重跑**，
   否则会重复提交 / 重复发起审批。
4. **提交审批弹窗的「确定」是 `<button>`，必须原生 `btn.click()`**；
   `dispatchEvent(new MouseEvent('click'))` 不生效且不报错（旧文档说"不是 button"是错的，那是别的弹窗）。
5. **合同主体会联动筛选入职部门树** —— 选完主体后树从 7 个一级部门缩到只剩 `CS Dpt.`，
   「后端 / 研发 / R&D」全搜不到。2026-11-13 Neil 在系统侧改了设置后 `R&D Dpt.` 才出现。
   ⇒ 遇到部门树缺节点，先刷新到**干净页面**确认是"联动筛选"还是"权限/配置"，别在脏表单上反复试。
6. **字段 label 带必填星号** ⇒ `item()` 匹配要先 `norm(innerText).replace(/^[*\s：:]+/,"")`，否则全找不到。
7. **汇报对象是 readonly 员工选择器，不是联想输入框** —— 点开 `.popover-pd`，
   在里面的搜索框输姓名 → 点 `.tree-item-node` 内的 `.item-wrap`。
8. **工作城市** `.select-world-city` 的候选项要向上找 `.el-tree-node__content` 祖先再点，直接点文本不落位。

### ⚠ 登录态是 session cookie —— Chrome 被强杀就会掉登录（历史方案 9333）
薪人薪事的登录 token 是**会话 cookie**（不落盘）。Chrome 进程一旦被**强杀**，
下次启动就是未登录（跳 `/sso/login`），cookie 里只剩 `XRXSTrackId / aliyungf_tc / zcp / lastAPITime`。

**根因**：Bash 工具的 `run_in_background` 启动的进程，**会随会话结束被回收（强杀）**。

**铁律**：
1. **只用计划任务 `ChromeCDPGuard` 启动 Chrome**（VBS 独立进程树，不受 Bash 回收影响）
2. **不要用 Bash 后台任务启动 Chrome** —— 那样起的实例会被回收 → 掉登录 → 后续脚本全挂在登录页
3. 掉了登录只能让用户重新扫码，**无法用脚本恢复**

**判据**：访问列表页后 body 含「工作台 / 审批中」= 已登录；含「验证码登录 / 忘记密码」= 掉了。

### 端口连不上

`connect ECONNREFUSED 127.0.0.1:9333`

| 原因 | 解法 |
|---|---|
| Chrome 进程被回收 | 让 Chrome 挂在**持续运行的后台任务**里（同一条命令跟一个长循环 `for i in $(seq 1 200); do sleep 15; done`） |
| profile 路径含中文 | `--user-data-dir` **必须纯 ASCII**：`D:\AI-Workspace\cdp-profile`。含中文时参数编码被破坏，Chrome 附着到用户日常实例，调试端口不开 |
| profile 被锁 | 用同一 profile 目录，不要 `launch` 新实例（会掉登录态） |

### 保持常驻

```bash
bash "D:/AI-Workspace/校招审批/start-chrome.sh"   # 幂等启动脚本
```
另有计划任务 `ChromeCDPGuard` 每分钟自愈（VBS 静默版，不闪黑窗）。

## 四、图片

### Playwright 截图超时

`page.screenshot: Timeout 30000ms exceeded` / `waiting for fonts to load` —— 页面有动画在跑。
**解法**：统一加 `timeout: 12000` + try/catch 兜底；或改用 `fetch` 下载已上传图片的 URL 来核对（更可靠）。

### Chrome 截 PDF 会截到阅读器工具栏

用 pdf.js（cdnjs 3.11.174）渲染，不用 Chrome 直接开 PDF。

## 五、系统层

### VS Code 端 git 不可用（Git 面板空白）
**症状**：项目已 `git init` 且已推送，但 VS Code 打开后「源代码管理」视图是空的 / 提示找不到 git。

**根因**：VS Code 找不到 `git` 可执行文件。两个常见来源：
1. **git 不在系统 PATH** —— 本机 git 只随 Git Bash 的 PortableGit 提供（`~/.workbuddy/binaries/PortableGit/versions/<ver>/cmd/git.exe`），Windows PATH 里没有
2. **VS Code 进程环境变量是旧的** —— 即使后来加了 PATH，已运行的 VS Code 实例不会继承，必须完全重启

**解法（两条都做）**：
```powershell
# 1) 建稳定入口（junction 指向版本目录，PortableGit 升级时不会失效）
$gitLink = "$HOME\bin\git"
$gitTarget = "$HOME\.workbuddy\binaries\PortableGit\versions\<ver>\cmd"
New-Item -ItemType Junction -Path $gitLink -Target $gitTarget
[Environment]::SetEnvironmentVariable("Path", "$userPath;$gitLink", "User")

# 2) 在 VS Code 设置里显式指定（不依赖 PATH 继承，优先级更高）
#    %APPDATA%\Code\User\settings.json
{ "git.path": "$HOME\\bin\\git\\git.exe" }
```
改完 `settings.json` 后**完全重启 VS Code**（关掉所有 Code 进程再启动）。

⚠ **改完 PATH 当前进程不会生效** —— 验证要手动拼 `User + Machine` 后重跑：
```powershell
$env:Path = [Environment]::GetEnvironmentVariable("Path","User") + ";" + [Environment]::GetEnvironmentVariable("Path","Machine")
```

**验证**：VS Code 里按 `Ctrl+Shift+B` 跑「Git: 查看仓库状态」任务（见 `.vscode/tasks.json`），能输出分支行即通。

### 用 VS Code CLI 打开目录
✅ **用 `code <路径>` 命令**（`code.cmd` 通过 `ELECTRON_RUN_AS_NODE=1` 转发参数）。
❌ **不要直接调 `Code.exe <路径>`** —— 会被 Electron 当成入口模块执行，报
   `Error: Cannot find module '<路径>'`。
❌ Git Bash 里直接调 `Code.exe` 也不行（MSYS 参数转换），报 `bad option: --verbose`。

### Git Bash 里 `powershell.exe -Command` 会被拦
报 "Invoking PowerShell from Bash bypasses PowerShell security checks" → 改用 PowerShell 工具。

- **`/tmp` 不通用**：Git Bash 的 `/tmp` = `$TEMP`（即 `%LOCALAPPDATA%\Temp`），但 **Windows Python 不认 `/tmp`** → 必须给 Windows 绝对路径
- **Windows Python 不认 MSYS 的 `/tmp`**，脚本里读该目录文件要给 `D:\AI-Workspace\...` 这种绝对路径
- **pip 源**：清华源在本机返回 **403**，阿里源极慢 → **优先官方源 `https://pypi.org/simple`**
- **schtasks.exe 在程序黑名单里** → 查计划任务用 PowerShell 的 `Get-ScheduledTask`，且**结果要写文件再读**（stdout 拿不到）
- **Node 版本目录会漂移**：托管 Node 在 `~/.workbuddy/binaries/node/versions/22.22.2-6/`，升级后会变 → 脚本里用绝对路径引用时注意

## 六、流程性

### ⚠ 邮件模板要按「用工性质」选，不是按「有没有默认值」

社招 offer 模板固定 **「正式员工 - 福州」**；校招是「校招」模板。
模板下拉默认值可能正好是「正式员工 - 福州」（社招场景），
但**不能因为默认值对就跳过显式选择** —— 预览后 label 会变重复、索引会漂，
显式选一次才稳。

### ⚠ 草稿不保存 ⇒ 「选模板」「插图片」都不会留存

填表 / 选模板 / 插图 / 发送必须**在同一次页面会话内连续跑完**，
中间任何一次 `goto` / `reload` 都会丢失全部未提交内容。
⇒ 必须写成「一站式」脚本，别拆成两步。

### ⚠ 邮件正文校验要在「修改邮件内容」弹窗关闭前做

弹窗点「确定」后 `.wangEditor-txt` 就从 DOM 消失了，
事后想校验正文会拿到 `undefined`。所以校验必须**插在插图之后、点确定之前**。

### fetch 下载大文件时 btoa 会爆栈

`String.fromCharCode(...new Uint8Array(buf))` 在 1MB+ 时报
`RangeError: Maximum call stack size exceeded`。改成**分块**（每次 8192 字节）再 `btoa`。

### ⚠ 跨天发送 ⇒ 告知有效期要按实际发送日重算

意向书是**先**生成的，offer 是**后**发的。跨天时意向书里写的有效期就过期了。

有效期规则：**从发送当天起算、含当天**（对应 offer 表单的「offer有效期」= N 天）。
例：10-29 生成、10-31 发送、有效期 3 天 → 告知有效期应至 **11-02**，不是 11-01。

⇒ 用 `OFFER_BASE_DATE` 环境变量指定**实际发送日**重跑意向书：

```bash
OFFER_BASE_DATE=2026-10-31 node gen-intent.js "<候选人cfg JSON>"
```

⚠ 只改 people.js 的日期字段**没用** —— 有效期是 `valid-date.js` 的
`attachValidDates()` 在运行时动态计算的，必须带环境变量重跑。

### ⚠ 意向书 PDF 与邮件插图（jpg）是两份独立产物

改了 PDF **必须重新生成插图**，否则邮件里发出去的还是旧版。

```bash
node make-insert-png.js          # 全量
node make-insert-png.js 15 16    # 只生成指定 no（改了个别 PDF 后用这个）
```

**核验发出的对不对**：从日志拿插图的 ptoken，`fetch` 下载服务器上那一份，
比对字节数与本地一致 = 发的是修正版；不一致就是插图没重新生成。

## 七、模板改版（2026-11-04 tech 模板改版实录）

⚠⚠ **模板一改，字符下标会漂移，而生成流程不会报错** —— 只会静默填错位置。
2026-11-04 tech 模板从 53344 → **53308** 字节，改了 4 处：

| # | 改了什么 | 后果 |
|---|---|---|
| 1 | 职位名槽位 6位→**8位** | 旧 len=6 只填一半，职位名被截断 |
| 2 | 入职「日」槽位 2位→**1位** | 旧 len=2 **多吃一个字**（把后面的「日」吃掉） |
| 3 | 有效期「日」槽位 2位→**1位** | 同上 |
| 4 | 「试用期收入比例」变成**可填槽位** | 旧脚本没这一项 ⇒ 输出模板示例「× 100%」 |

### 检测

```bash
node -e "const fs=require('fs'),p=require('path');const c=require('./config.js');
for(const [k,v] of Object.entries(c.templates)){
  const f=p.join(c.TEMPLATE_DIR,v.file); const st=fs.statSync(f);
  console.log(k, st.size===v.fingerprint.size?'✓':'✗ 已改版 '+st.size+' vs '+v.fingerprint.size);
}"
```

### 改版后的处理三步

```bash
cd scripts
powershell -NoProfile -ExecutionPolicy Bypass -File dump-template.ps1 -Template "<模板绝对路径>"
node parse-slots.js "template-dump.txt" "<slots.json>"
node verify-slots.js
```

⚠ **dump 与 slots 必须来自同一次 dump**，且要落到 `verify-slots.js` 读的那个位置
（`$HIRE_SLOTS_DIR/slots-<key>.json` + `dump-<key>.txt`）。
只改一个 ⇒ 校验结果全是假阳性。

### ⚠ verify-slots 的三个漏洞（2026-11-12 已修）

旧版 `verify-slots.js` 会**漏报**且**假阳性**：

| 漏洞 | 后果 | 现在 |
|---|---|---|
| 只查「len 超长」，**不查缩短** | 槽位从 2 位变 1 位 → 不报错 → 静默多吃一个字 | 精确比对「值部分长度」 |
| dump 与 slots **版本不配套** | 拿旧 dump 校验新 config ⇒ 全绿但毫无意义 | slots 记录 `__dumpSize`，交叉比对 |
| **指纹不符仍继续校验** | 模板改了但快照是旧的 ⇒ 「全部对齐」是假阳性 | 指纹不符 ⇒ 立即失败 |

⚠ 长度判据用「**值部分长度**」（trim 掉首尾空格），不是槽位总长：
槽位 `5440    ` 的值只有 4 位，尾部空格是留白。
但 `gen-intent-sales.js` 那套是**整段替换**（连空格一起换），语义不同 ⇒
用 `config.templates.<key>.strictLen` 区分（tech 走精确替换 ⇒ 开）。

### ⚠ 模板示例人名会变 ⇒ 必须自动探测

| 版本 | 示例人名 |
|---|---|
| 2025 版 | 赖沄葱 |
| **2026-11-04 版** | **林清云** |

硬编码替换**不命中且不报错** ⇒ 意向书上印的是模板示例人名。
⇒ 脚本运行时用正则探测「X：您好」取名；探测不到 ⇒ 中止。
（正则要走 JSON 传给 PS，ps1 源文件必须纯 ASCII。）

### ⚠ 比例文字是正文，不是槽位

R13 三列的「占目标税前收入满额的**80%**，」是**普通正文字**，
字符级替换改不到它。管理序列 75/5/20 时必须单独 Find/Replace，
否则「75% 的钱」配「80% 的字」，自相矛盾且不报错。

### ⚠「留空」要用等长空格

入职日期待定时**不要印模板示例值**。填等长空格 ⇒ 下划线格式完整继承，
看不出是占位。空格数 = 原槽位长度。

## 八、生成结果不对但脚本报成功

`WORD_OK` 只代表 Word 跑完了，**不代表内容对**。

2026-11-12 那次，脚本报 `WORD_OK`，但图上三处错：

| 错 | 怎么发现的 |
|---|---|
| 称呼是模板示例人名 | 裁抬头段看图 |
| 有效期是「年NaN月NaN日」 | 裁告知段看图 |
| 比例文字与金额矛盾 | 裁薪酬段看图 |

⇒ **必须裁图核验至少四段**：抬头 / 日期+试用期 / 薪酬 / 有效期。
裁图脚本见 `workflow-social-intent.md`（或用 `crop-pdf.js`）。

### 脚本内置的三道保险

`gen-intent.js` 现在会：
1. **必填字段校验** —— 缺字段 `exit 3`（挡 NaN）
2. **金额/比例自洽校验** —— 合计≠满额 `exit 3`
3. **称呼自动探测** —— 找不到 `exit 9`

⇒ 这三道之外仍需看图（正文条款、留白格是否正确）。


- **模板会被公司更新** → 生成前做版本校验（`config.js` 的 `fingerprint` 比对 Size/LastWriteTime），不一致先跑 `dump-template.ps1`
- **卡片应聘职位 ≠ offer表单岗位** → 以 offer 表单为准（那是要发出去的）
- **意向书先生成、offer后发送** → 跨天时有效期对不上，用 `OFFER_BASE_DATE` 指定发送日重跑
- **offer是外发内容** → 发送前停下给Neil确认


### ⚠⚠ 判断 offer 是否真的发出：不要看 offer 列表页的「offer发送时间」列

**那列是空的** —— 已成功发出的候选人（王彤）那列同样是空的。
按它判断会得出「没发出去」的错误结论，然后白跑一轮。

✅ **正确判据：候选人详情页右侧的 offer 记录区**（阶段条选「offer」那一栏）。
每条记录带：
- 状态：`待确认` / `已失效` / `已接受`
- **到期时间**（如「1105到期」）
- **发起时间** + 发件人姓名

三个判据强度递增：

| # | 判据 | 强度 |
|---|---|---|
| 1 | 卡片按钮 `发送Offer` → `重发Offer` | 🟠 弱（**撤销审批后也会变**，不能单独用） |
| 2 | 右侧 offer 记录区出现新记录且状态「待确认」 | 🟢 强 |
| 3 | 记录的「到期时间」= 意向书告知有效期 | 🟢 强（**交叉验证**） |

⚠ 同一个候选人会留下**多条** offer 记录（每次重发一条），
前几条会是「已失效」——**只有最新那条**是当前有效的。

### ⚠⚠⚠ 预览 offer 时可能弹「必审字段被修改（查看修改字段），将重新审批offer」

**必须点「取消」**，点「确定」= 发起新一轮录用审批，offer 发不出去
（实测：卡片变「审批中」，offer 记录变「已失效」）。

**触发条件**：系统拿 offer 表单当前值与**录用审批留值**逐字段比对，
不一致的必审字段就弹这个框。

**实测触发点**：录用审批提交时**薪酬没落库**（提交弹窗出现但值没存进去），
而 offer 表单有薪酬 ⇒ 判定「薪酬被改」。

⇒ **修法：在录用审批页把薪酬填上并「保存草稿」**（不要点「确定」提交，那会发起审批），
让两边一致后再回 offer 页预览。
保存后**重新加载验证**薪酬还在（实测能留存）。

### ⚠⚠ 下拉选项过滤不能按视口裁剪

`bb.y > 0 && bb.y < 1400` 这种视口过滤会让选项列表变空
（选项可能在视口外，或动画期坐标为 0）。
⇒ 只按 `width > 8 && height > 4` 过滤；
点击优先用 **Playwright locator**（`.el-select-dropdown__item` + `filter({hasText})`），
坐标点击兜底。

### ⚠⚠ 取按钮坐标前必须先 scrollIntoView

`getBoundingClientRect()` 在元素没滚进视口时返回视口外坐标
（实测「修改邮件」按钮 y=1733 > 视口高 1400，点击落空）。
⇒ `el.scrollIntoView({block:'center'})` **之后再**取 rect。

### ⚠⚠ 弹窗里的「确定」不是 `<button>` 元素

「提交审批」「确定发送offer吗?」「必审字段被修改」这些弹窗的按钮是 `span`/`div`。
⇒ 遍历 `.el-dialog, .el-message-box, [role="dialog"]`，
在**可见**（width>100 && height>60）的对话框里找 innerText 恰为「确定」的元素 → 坐标点。
`locator('button:visible')` 和 `getByText` 都可能匹配不到。

> **2026-11-13 更正（CDP 版）**：录用审批的「提交审批」确认框里，「确定」**就是 `<button>`**。
> `dispatchEvent(new MouseEvent('click'))` 不生效（页面不提交、也不报错），
> 必须用 **`btn.click()` 原生调用**。两种说法并不冲突：不同弹窗组件不一样，
> 稳妥写法 = 先找 `d.querySelectorAll('button')` 里 innerText 恰为「确定」的，直接 `.click()`；
> 找不到再退回「可见对话框内文本节点 + 坐标点击」。

## 八、2026-11-13 新增（某社招候选人审批实战）

### ⚠⚠ 合同主体会按白名单**筛掉部门树**，且筛选是静默的

选完「合同主体」后，入职部门下拉树会被筛成该主体授权的部门，
**不报错、不提示**，只会让你找不到目标部门：

| 合同主体 | 选完后部门树一级节点 |
|---|---|
| 福州誉龙智能科技有限公司 | 仅 `R&D Dpt.(产品研发线)`、`CS Dpt.(客户成功线)` |
| 成都先锋寰宇科技有限公司 | 完整 7 条线 |
| **留空** | 完整 7 条线 |

- 2026-11-03 某后端研发管理岗候选人那次，Neil 在后台给福州誉龙放行了 R&D，才有「后端组」可选；
  2026-11-13 某社招候选人需要 `HR&ADM Dpt.(人力行政线)`，福州誉龙**没放行** ⇒ 树里根本没有 HR 线。
- **Neil 口径（特例）**：「无需添加合同」⇒ 合同主体**留空**提交（`subject: ""`，
  label 无必填星号，实测提交成功、卡片进入审批中）。留空后部门树保持完整。
- ⇒ 填表前先确认「目标部门所在一级线」是否在所选主体的白名单里；
  不在就留空 / 换主体 / 让 Neil 在后台放行，**别硬找节点**。
- HR 线完整路径：`HR&ADM Dpt.(人力行政线)` → `Human Resources(人力资源部)`
  → `CN 人力资源部` / `US 人力资源部`（CN 已是最末级）。

### ⚠ CDP `/eval` 报「命令超时」≠ 命令没执行

`cdp-proxy.mjs` 的命令超时是 **30s**。2026-11-13 两次实测：
报 `CDP 命令超时: Runtime.evaluate` 时，**字段其实已经写进页面了**（响应丢了而已）。

⇒ 超时后**先读回页面快照**（`window.__A` 还在、薪酬 6 项的值、各字段值），
确认已写入就 **不要整表重填**（草稿刷新即丢），用
`node cdp-approval.js --resume --send` 从断点（step10）继续。
脚本 `--resume` 会跳过 navigate 与 step1-9，并做「9R 薪酬逐项复核」再提交。

### ⚠ 转图脚本已换：`make-insert-png.js` 停用

旧脚本 `require('playwright-core')` + 从 cdnjs 拉 pdf.js，playwright 卸载后直接跑不了。
✅ 改用 `scripts/make-insert-pymupdf.py`（PyMuPDF 2.0 + Pillow，无需浏览器/网络）：

```bash
python "$HIRE_SKILL_DIR/scripts/make-insert-pymupdf.py" --names "<outName>"
```

同规格输出 3176 宽 JPEG q=90 ≈ 1.8MB。

### Neil 口径 → 系统真实选项的映射（别照抄叫法）

| Neil 说的 | 系统里实际要选 |
|---|---|
| 「职能序列-P1」 | 职级树 `专业序列-P` → `P1`（一级只有 管理-M / 专业-P / 营销-S / 技术-T） |
| 初级招聘专员 | 岗位树 `职能` 分类下（不是「管理」） |
| 「汇报 VP」 | HR&ADM 线 Leader = `HR&ADM Dpt.(人力行政线) \| VP`，员工选择器搜该负责人姓名 |

职级树/岗位树点**一级叶子文本**才会展开子项，点 `.el-tree-node__expand-icon` 常常无效。

### ⚠ 钉钉提醒称呼别自作主张加「老师」

2026-11-13 第一次沉淀时按中文职场习惯把称呼写成「中文名+老师」，Neil 随即纠正：
「后续提醒，把老师删掉就叫英文就行了，比如 Ivy」。

⇒ **只叫英文名**（从 EHR 显示名 `中文名(Ivy X)` 取括号里第一个词 `Ivy`），
不加「老师」、不带姓、不用中文名/简称、不加职务。纯中文显示名取不到英文名就先问 Neil。
细则见 [钉钉审批提醒环节](dingtalk-approval-reminder.md)。
教训：称呼是 Neil 的口径，不要按中文职场习惯「礼貌补全」；预览和真发必须同一套文案。

## 九、2026-11-13 社招 offer CDP 版实战（playwright → Web Access 迁移）

### ① 旧 offer 脚本不能直接改依赖，要按「底本 + 换驱动层」整理

`offer-onepass-social.js` 是 playwright 版，连 9333 独立 Chrome 实例；playwright-core 卸载后整条链路失效。
✅ 正解（Neil 口径「脚本可以基于以前的重新整理，我们的skill已经换了」）：
**业务顺序/校验逻辑全部保留，只把浏览器驱动换成 Web Access CDP Proxy**（`/eval`、`/clickAt`、
`/navigate`、`/setFiles`、`/targets`，端口 3456，日常 Chrome 9222）。
产出 `cdp-offer-social.js` + `cdp-lib.js` + `cdp-offer-helpers.js`。

### ② 页面内 helper 要独立成文件

第一次把 helper 写在主脚本的数组里拼字符串，括号不匹配 ⇒ `/eval` 只回 `Uncaught`，看不到行号。
✅ 拆成 `cdp-offer-helpers.js`，主脚本 `fs.readFileSync` 注入，可先 `node --check` 校验语法。

### ③ 抄送邮箱远程联想：三个连着的坑

`el-select` 的抄送人联想必须逐字符派发 `keydown → native setter → InputEvent → keyup`，
直接改 value + 一次 input **不触发远程搜索**。另外：

| 坑 | 现象 | 解法 |
|---|---|---|
| 逐字符时读 `inp.value + ch` 再写回 | Vue 异步更新把值打乱成「首尾字符重复 + 乱序」（如 `XYZ` → `ZXYZ`），远程搜索返回「无数据」 | 自己维护累加缓冲 `buf`，每轮写完整 `buf` |
| 联想轮询写在页面内 `await` 循环 | 单次 `/eval` 超过 30s 超时 | 轮询放 **Node 侧**，每次只做一次短 `/eval` |
| 用 `height>4` 过滤 `.el-select-dropdown__item` | 下拉展开 300ms 动画中高度为 0，已返回的选项被全滤掉，误判「未匹配」 | **不按尺寸过滤**，按文本匹配后用**原生 `el.click()`** 选中（动画中坐标点击会落空） |

### ④ `/clickAt` 与原生 `click()` 各有适用面

普通按钮/下拉用 `/clickAt`（真实鼠标，能触发 Vue 下拉）；
**动画中高度 0 的联想项、提交弹窗「确定」**用元素原生 `btn.click()`，坐标点击会落空。

### ⑤ 插图上传走 `/setFiles`，不要找 filechooser

「修改邮件」→ 把光标放到编辑器末尾 → 点图片按钮 → 弹「图片上传」→
给弹窗里的 `input[type=file]` 打 `data-cdp-file="1"` →
`POST /setFiles?target=` body `{"selector":"input[type=file][data-cdp-file=\"1\"]","files":["<绝对路径>"]}`。
回执 `{"success":true,"files":1}`；等 9s 后正文 `imgCount` 应为 **2**（模板水印图 + 意向书）。

### ⑥ 🔴 发送成功会跳页并卸载 helper，别误报 FATAL

点完「确定发送offer吗?」的「确定」后，SPA 跳到 `/recruitment/detail`，
`window.__O` 整个消失；收尾若继续 `window.__O.dialogs()` ⇒ `/eval` 抛 `Uncaught` ⇒ 脚本打 `FATAL`。
**实测这次 offer 其实已经发出去了**（详情页卡片「offer待确认」、记录区「待确认-11/15到期」）。
✅ 收尾一律用 `safeE(expr, fallback)` 容错，且核验表达式**不依赖 helper**，只读 `document.body.innerText`。

### ⑦ 任何「成功/失败」结论都要用三重判据，不要看脚本退出码

`发送动作已执行` ≠ 发送成功；脚本 `FATAL` ≠ 发送失败。
唯一判据仍是详情页：**卡片「offer待确认」/「重发Offer」+ 记录区「待确认-N/N到期」+ 发起时间/发件人**。
到期时间还要与意向书「本通知书有效日期至」交叉验证。

## 十、2026-11-16 打印纸质录用意向书（多份）

### 🔴 PowerShell 里 .NET 动态编译/加载全被沙箱拦

`Add-Type`（连 `Add-Type -AssemblyName System.Drawing` 这种纯加载也算）和
`[System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")` 会被安全策略直接拒绝：

```
Command blocked for security: Add-Type compiles and loads .NET code at runtime
Command blocked for security: Reflection.Assembly load APIs execute arbitrary .NET code
```

⇒ 别在 `.NET PrintDocument` 这条路上反复试错。

### ✅ 正解：pywin32 + Pillow `ImageWin.Dib` 直接打 GDI

本机 managed Python 已带 `win32print` / `win32ui` / `Pillow`，零安装、零弹窗、份数可控。

1. PDF → 300 DPI PNG：`pymupdf` `page.get_pixmap(dpi=300, alpha=False)`（A4 = 2480×3508）。
2. **图片路径必须是纯 ASCII**（复制到 `$TEMP\xxx.png`）；Windows 路径含中文时 PowerShell/脚本易乱码。
3. `win32ui.CreateDC()` → `CreatePrinterDC(win32print.GetDefaultPrinter())` → `StartDoc`。
4. 取 `HORZRES/VERTRES`（可打印区像素）与 `PHYSICALOFFSETX/Y`，**等比缩放居中**画到该区域，
   不要直接画满整页 —— 打印机有不可打印边距，会裁掉页眉/页脚。
5. `ImageWin.Dib(img).draw(dc.GetHandleOutput(), (x, y, x+w, y+h))`。
6. **要 N 份就 `StartPage/EndPage` 循环 N 次**（同一作业连续 N 张纸，比改 DEVMODE 的
   `dmCopies` 稳，pywin32 的 DEVMODE 属性名不保证）。
7. `EndDoc` → `DeleteDC`。

工作脚本：`D:\AI-Workspace\print_letter.py`（常量 `PNG` / `COPIES` / `TITLE`）。

### 判据：看打印队列，别只看脚本退出码

`Get-PrintJob -PrinterName "<打印机名>"` 应出现
`name=<TITLE> | pages=N | status=Complete`（本机是 `Complete, Retained`，驱动设了保留已打印作业）。

⚠ **软件只能证明作业已送到打印机**；是否真的出纸、有没有卡纸/缺纸，必须现场确认。
汇报时要写清这一层，不要说「已打印完成」当成实物已产出。

### 打印前先核对有效期

意向书上的「本通知书有效日期至」是**回复期限**，会过期。
打印当天若已过该日期（例：11/15 到期、11/16 才打印用于入职签字存档），
要主动提示 Neil 是否需要按新日期重出一版，别默认原文件仍有效。
