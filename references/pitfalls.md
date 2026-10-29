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
New-Item -ItemType Junction -Path "C:\Users\huiji\bin\git" `
  -Target "C:\Users\huiji\.workbuddy\binaries\PortableGit\versions\<ver>\cmd"
[Environment]::SetEnvironmentVariable("Path", "$userPath;C:\Users\huiji\bin\git", "User")

# 2) 在 VS Code 设置里显式指定（不依赖 PATH 继承，优先级更高）
#    %APPDATA%\Code\User\settings.json
{ "git.path": "C:\\Users\\huiji\\bin\\git\\git.exe" }
```
改完 `settings.json` 后**完全重启 VS Code**（关掉所有 Code 进程再启动）。

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
