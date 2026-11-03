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

### ⚠ 登录态是 session cookie —— Chrome 被强杀就会掉登录
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

- **模板会被公司更新** → 生成前做版本校验（`config.js` 的 `fingerprint` 比对 Size/LastWriteTime），不一致先跑 `dump-template.ps1`
- **卡片应聘职位 ≠ offer表单岗位** → 以 offer 表单为准（那是要发出去的）
- **意向书先生成、offer后发送** → 跨天时有效期对不上，用 `OFFER_BASE_DATE` 指定发送日重跑
- **offer是外发内容** → 发送前停下给Neil确认

### ⚠ 邮件模板要按「用工性质」选，不是按「有没有默认值」

offer 预览页的「邮件模板」下拉有 4 项：`正式员工 - 福州` / `正式员工 - 成都` /
`实习员工 - 通用` / `校招`。**社招必须选「正式员工 - 福州」**。

两版正文实质不同：正式员工版含**离职证明**、**薪资证明**（上一家单位或近3个月流水）、
**非中国国籍公民**条款，称呼是「先生/女士」；校招版是「同学」且无离职证明要求。

⚠ **默认值就是「正式员工 - 福州」**，所以「没选错」和「选对了」在界面上长得一样 ——
不主动选一次，一旦被重置就会静默发错。**必须显式选 + 校验落位 + 校验正文条款。**

⚠ 定位该下拉要按 `.el-select` 里的 **`input.value`** 匹配（`/正式员工|校招|实习/`），
**不能用 innerText** —— 实测它的 innerText 是空字符串，
`locator('.el-select').filter({ hasText: … })` 会匹配不到。

### ⚠ 草稿不保存 ⇒ 「选模板」「插图片」都不会留存

同一页面上选了邮件模板、插了意向书图，**只要刷新就全丢**（和录用审批表单同一条规律）。
所以：预览 → 选模板 → 插图 → 确认 → 发送，必须**一站式跑完**，中途不能 goto/reload。

上一轮如果分两次跑，第二次进来时模板已回落成默认值、意向书图也没了 ——
**但界面上看不出异常**，只有核对正文条款才能发现。

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
