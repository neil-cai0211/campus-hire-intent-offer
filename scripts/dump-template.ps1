# 录用意向书模板结构分析器
#
# 用法:
#   powershell -NoProfile -ExecutionPolicy Bypass -File dump-template.ps1 -Template "<模板绝对路径>"
#
# 输出:
#   1) 控制台摘要
#   2) 结构快照文件（UTF-8）到脚本同目录的 template-dump.txt，用 Read 工具读取
#
# 何时用: 模板被公司更新后，重新取字符下标表并更新 config.js 的 templates.<key>.fills
#
# IMPORTANT: keep this file ASCII-only. Non-ASCII (even in comments) breaks
# PowerShell 5.1, which reads .ps1 files as GBK unless a BOM is present.

param(
  [Parameter(Mandatory = $true)][string]$Template
)

$ErrorActionPreference = 'Stop'

$outFile = Join-Path $PSScriptRoot 'template-dump.txt'
$lines = New-Object System.Collections.ArrayList

function Add-Line([string]$s) { $null = $lines.Add($s) }

if (-not (Test-Path $Template)) {
  Write-Output ("NOT FOUND: " + $Template)
  exit 1
}

$fi = Get-Item $Template
Add-Line ("FILE   : " + $fi.FullName)
Add-Line ("SIZE   : " + $fi.Length)
Add-Line ("MTIME  : " + $fi.LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss'))
Add-Line ("FINGER : { size: " + $fi.Length + ", mtime: '" + $fi.LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss') + "' }")
Add-Line ""

# clean up leftovers that would make Documents.Open hang silently
Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
try { Get-ChildItem "$env:APPDATA\Microsoft\Word" -Filter '*.asd' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Item 'HKCU:\Software\Microsoft\Office\16.0\Word\Resiliency' -Recurse -Force -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 2

$w = New-Object -ComObject Word.Application
$w.Visible = $false
$w.DisplayAlerts = 0
$w.AutomationSecurity = 3

try {
  # ReadOnly=$true avoids the file write lock (and the hidden prompt that hangs it)
  $doc = $w.Documents.Open($Template, $false, $true)
} catch {
  Write-Output ("OPEN FAILED: " + $_.Exception.Message)
  $w.Quit()
  exit 2
}

$tb = $doc.Tables.Item(1)
$rows = $tb.Rows.Count
$cols = $tb.Columns.Count
Add-Line ("TABLE  : rows=" + $rows + " cols=" + $cols)
Add-Line ""
Add-Line "=== CELL OVERVIEW (plain text) ==="
for ($r = 1; $r -le $rows; $r++) {
  $line = "R" + $r + ": "
  for ($c = 1; $c -le 4; $c++) {
    try {
      $t = $tb.Cell($r, $c).Range.Text -replace "[\r\a\v]", ""
      if ($t.Length -gt 40) { $t = $t.Substring(0, 40) + "..." }
      $line = $line + "[C" + $c + "=" + $t + "] "
    } catch {
      $line = $line + "[C" + $c + "=merged] "
    }
  }
  Add-Line $line
}

Add-Line ""
Add-Line "=== CHARACTER MAP (idx / underline / char) ==="
Add-Line "legend: U = underlined (fillable slot), space = plain"
for ($r = 1; $r -le $rows; $r++) {
  for ($c = 1; $c -le 4; $c++) {
    $chars = @()
    $ok = $true
    try { $rg = $tb.Cell($r, $c).Range } catch { $ok = $false }
    if (-not $ok) { continue }
    $i = 0
    $any = $false
    foreach ($ch in $rg.Characters) {
      $t = $ch.Text
      if ($t -ne "`r" -and $t -ne "`a") {
        $m = " "
        if ($ch.Font.Underline -eq 1) { $m = "U" }
        $chars += ("[" + $i + "]" + $m + "'" + $t + "'")
        $i++
        $any = $true
      }
    }
    if ($any) {
      Add-Line ("--- R" + $r + "C" + $c + " ---")
      Add-Line ($chars -join " ")
    }
  }
}

$doc.Close($false)
$w.Quit()

$utf8 = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllLines($outFile, $lines, $utf8)
Write-Output ("DUMP WRITTEN: " + $outFile)
Write-Output ("rows=" + $rows + " cols=" + $cols)
