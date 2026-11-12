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
