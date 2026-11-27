# 小公主的星球（星球桌布）— 安裝程式
param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$Src  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = Join-Path $env:LOCALAPPDATA 'PlanetWallpaper'
$Title = '小公主的星球'
$ManagerName = '星球居民及行事曆管理'

try {
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $edge) { throw '找不到 Microsoft Edge，這個桌布需要用 Edge 來顯示。' }

  # 若已安裝過，先停止舊的桌布
  if (Test-Path (Join-Path $Dest 'lpw.ps1')) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dest 'lpw.ps1') -Action stop
  }

  # 升級前備份：程式檔與資料各留一份（保留最近 3 次），可用 rollback.ps1 還原上一版程式
  $Program = @('index.html', 'control.html', 'open-control.html', 'princess-chat.html', 'lpw.ps1', 'PlanetAi.cs', 'uninstall.ps1', 'rollback.ps1')
  if (Test-Path (Join-Path $Dest 'lpw.ps1')) {
    $bkRoot = Join-Path $env:LOCALAPPDATA 'PlanetWallpaper-backup'
    $bk = Join-Path $bkRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
    New-Item -ItemType Directory -Force $bk | Out-Null
    foreach ($f in $Program + @('data.json', 'data.dat', 'ai-settings.json')) {
      $p = Join-Path $Dest $f; if (Test-Path $p) { Copy-Item $p (Join-Path $bk $f) -Force }
    }
    if (Test-Path (Join-Path $Dest 'ai\lib')) { New-Item -ItemType Directory -Force (Join-Path $bk 'ai') | Out-Null; Copy-Item (Join-Path $Dest 'ai\lib') (Join-Path $bk 'ai\lib') -Recurse -Force }
    Get-ChildItem $bkRoot -Directory | Sort-Object Name -Descending | Select-Object -Skip 3 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }

  New-Item -ItemType Directory -Force $Dest | Out-Null
  foreach ($f in 'index.html', 'control.html', 'open-control.html', 'lpw.ps1', 'PlanetAi.cs', 'uninstall.ps1', 'rollback.ps1') {
    Copy-Item (Join-Path $Src $f) (Join-Path $Dest $f) -Force
  }
  # AI Lite：對話視窗、離線語音模型與函式庫（一般版沒有這些檔案，安裝一般版時移除）
  $HasAi = Test-Path (Join-Path $Src 'princess-chat.html')
  if ($HasAi) {
    Copy-Item (Join-Path $Src 'princess-chat.html') (Join-Path $Dest 'princess-chat.html') -Force
    foreach ($d in 'ai\lib', 'ai\models', 'ai\licenses') {
      $to = Join-Path $Dest $d
      New-Item -ItemType Directory -Force $to | Out-Null
      Copy-Item (Join-Path $Src "$d\*") $to -Recurse -Force
    }
    # 安裝包內附 SHA-256 清單：模型與函式庫不符就停止安裝
    foreach ($line in Get-Content -LiteralPath (Join-Path $Src 'SHA256SUMS-ai.txt') -Encoding UTF8) {
      if ($line -notmatch '^([0-9a-f]{64})\s+\*?(.+)$') { continue }
      $file = Join-Path $Dest $Matches[2]
      if (-not (Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Matches[1]) { throw "檔案驗證失敗：$($Matches[2])" }
    }
  } else {
    Remove-Item (Join-Path $Dest 'princess-chat.html') -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $Dest 'ai') -Recurse -Force -ErrorAction SilentlyContinue
  }
  # 解除安裝時選擇保留的資料，重新安裝時放回
  $kept = Join-Path $env:LOCALAPPDATA 'PlanetWallpaper-kept'
  if ((Test-Path $kept) -and -not (Test-Path (Join-Path $Dest 'data.dat')) -and -not (Test-Path (Join-Path $Dest 'data.json'))) {
    Copy-Item (Join-Path $kept '*') $Dest -Recurse -Force
    Remove-Item $kept -Recurse -Force -ErrorAction SilentlyContinue
  }
  $icons = Join-Path $Dest 'icons'
  New-Item -ItemType Directory -Force $icons | Out-Null
  foreach ($name in 'manager.ico', 'start.ico', 'stop.ico', 'remove.ico') {
    Copy-Item -LiteralPath (Join-Path $Src "icons\$name") -Destination (Join-Path $icons $name) -Force
  }

  # 啟動器：安裝時在本機編譯一個沒有視窗的小程式，直接以「不建立主控台」的方式執行 PowerShell。
  # 不依賴 VBScript，也不受「預設終端機」設定（Windows Terminal）影響。
  $launcher = Join-Path $Dest 'PlanetWallpaper.exe'
  Remove-Item $launcher -Force -ErrorAction SilentlyContinue
  Add-Type -OutputAssembly $launcher -OutputType WindowsApplication -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
public static class Program {
  [STAThread]
  public static void Main(string[] args) {
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    string action = args.Length > 0 ? args[0].ToLowerInvariant() : "start";
    if (action != "start" && action != "stop" && action != "control" && action != "chat" && action != "uninstall") action = "start";
    string script = action == "uninstall"
      ? "\"" + Path.Combine(dir, "uninstall.ps1") + "\""
      : "\"" + Path.Combine(dir, "lpw.ps1") + "\" -Action " + action;
    var psi = new ProcessStartInfo(
      Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe"),
      "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " + script);
    psi.UseShellExecute = false;
    psi.CreateNoWindow = true;
    psi.WorkingDirectory = dir;
    Process.Start(psi);
  }
}
'@
  if (-not (Test-Path $launcher)) { throw '無法建立啟動程式。' }

  $sh = New-Object -ComObject WScript.Shell
  function New-Shortcut([string]$path, [string]$target, [string]$arguments, [string]$desc, [string]$icon) {
    $l = $sh.CreateShortcut($path)
    $l.TargetPath = $target
    $l.Arguments = $arguments
    $l.WorkingDirectory = $Dest
    $l.Description = $desc
    $l.IconLocation = $icon
    $l.Save()
  }
  $managerIcon = (Join-Path $icons 'manager.ico') + ',0'
  $startIcon = (Join-Path $icons 'start.ico') + ',0'
  $stopIcon = (Join-Path $icons 'stop.ico') + ',0'
  $removeIcon = (Join-Path $icons 'remove.ico') + ',0'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $menu = Join-Path ([Environment]::GetFolderPath('Programs')) '星球桌布'
  if (!$HasAi) { Remove-Item -LiteralPath (Join-Path $menu '和小公主說話.lnk') -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force $menu | Out-Null
  New-Shortcut (Join-Path $menu '啟動星球桌布.lnk') $launcher 'start' '把小公主的星球設為桌布' $startIcon
  New-Shortcut (Join-Path $menu '停止星球桌布.lnk') $launcher 'stop' '停止動態桌布，回到原本的桌布' $stopIcon
  New-Shortcut (Join-Path $menu "$ManagerName.lnk") $launcher 'control' '新增居民、管理行事曆、選擇顯示螢幕' $managerIcon
  if ($HasAi) { New-Shortcut (Join-Path $menu '和小公主說話.lnk') $launcher 'chat' '開啟小公主對話視窗（快速鍵 Ctrl+Alt+P）' $managerIcon }
  New-Shortcut (Join-Path $menu '解除安裝星球桌布.lnk') $launcher 'uninstall' '移除星球桌布' $removeIcon
  New-Shortcut (Join-Path $desktop "$ManagerName.lnk") $launcher 'control' '新增居民、管理行事曆、選擇顯示螢幕' $managerIcon
  New-Shortcut (Join-Path ([Environment]::GetFolderPath('Startup')) '星球桌布.lnk') $launcher 'start' '開機時自動啟動星球桌布' $startIcon

  Start-Process $launcher -ArgumentList 'start'

  if (!$Quiet) { [System.Windows.Forms.MessageBox]::Show(
    "安裝完成！桌布會在幾秒內出現，並自動配合螢幕大小。`n`n" +
    "・桌面上的「$ManagerName」可以新增居民、管理行事曆，並選擇桌布顯示在主螢幕、副螢幕或同時顯示`n" +
    "・開機時會自動啟動`n" +
    $(if ($HasAi) { "・按 Ctrl+Alt+P 或開始功能表「和小公主說話」可以用文字或語音和小公主對話（可選本機或 Groq AI）`n" } else { '' }) +
    "・開始功能表 →「星球桌布」可以停止或解除安裝",
    $Title, 'OK', 'Information') | Out-Null }
} catch {
  if ($Quiet) { throw }
  [System.Windows.Forms.MessageBox]::Show("安裝失敗：$($_.Exception.Message)", $Title, 'OK', 'Error') | Out-Null
  exit 1
}
