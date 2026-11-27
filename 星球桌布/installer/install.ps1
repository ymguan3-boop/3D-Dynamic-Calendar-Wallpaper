# 小公主的星球（星球桌布）— 安裝程式
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

  New-Item -ItemType Directory -Force $Dest | Out-Null
  foreach ($f in 'index.html', 'control.html', 'open-control.html', 'lpw.ps1', 'uninstall.ps1') {
    Copy-Item (Join-Path $Src $f) (Join-Path $Dest $f) -Force
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
    if (action != "start" && action != "stop" && action != "control" && action != "uninstall") action = "start";
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
  # 管理視窗的捷徑直接開 Edge（從捷徑經由腳本再開 Edge 視窗會被 Edge 忽略）
  $controlUrl = ([Uri](Join-Path $Dest 'open-control.html')).AbsoluteUri
  $edgeArgs = "--user-data-dir=`"$Dest\edge-profile`" --app=`"$controlUrl`" --window-size=440,880 " +
    '--no-first-run --no-default-browser-check --hide-crash-restore-bubble --disable-session-crashed-bubble ' +
    '--disable-extensions --disable-sync --disable-translate --disable-backgrounding-occluded-windows ' +
    '--disable-renderer-backgrounding --disable-background-timer-throttling ' +
    '--disable-features=CalculateNativeWinOcclusion,Translate,msEdgeStartupBoost'

  $managerIcon = (Join-Path $icons 'manager.ico') + ',0'
  $startIcon = (Join-Path $icons 'start.ico') + ',0'
  $stopIcon = (Join-Path $icons 'stop.ico') + ',0'
  $removeIcon = (Join-Path $icons 'remove.ico') + ',0'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $menu = Join-Path ([Environment]::GetFolderPath('Programs')) '星球桌布'
  Remove-Item $menu -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $menu | Out-Null
  New-Shortcut (Join-Path $menu '啟動星球桌布.lnk') $launcher 'start' '把小公主的星球設為桌布' $startIcon
  New-Shortcut (Join-Path $menu '停止星球桌布.lnk') $launcher 'stop' '停止動態桌布，回到原本的桌布' $stopIcon
  New-Shortcut (Join-Path $menu "$ManagerName.lnk") $edge $edgeArgs '新增居民、管理行事曆、選擇顯示螢幕' $managerIcon
  New-Shortcut (Join-Path $menu '解除安裝星球桌布.lnk') $launcher 'uninstall' '移除星球桌布' $removeIcon
  New-Shortcut (Join-Path $desktop "$ManagerName.lnk") $edge $edgeArgs '新增居民、管理行事曆、選擇顯示螢幕' $managerIcon
  New-Shortcut (Join-Path ([Environment]::GetFolderPath('Startup')) '星球桌布.lnk') $launcher 'start' '開機時自動啟動星球桌布' $startIcon

  Start-Process $launcher -ArgumentList 'start'

  [System.Windows.Forms.MessageBox]::Show(
    "安裝完成！桌布會在幾秒內出現，並自動配合螢幕大小。`n`n" +
    "・桌面上的「$ManagerName」可以新增居民、管理行事曆，並選擇桌布顯示在主螢幕、副螢幕或同時顯示`n" +
    "・開機時會自動啟動`n" +
    "・開始功能表 →「星球桌布」可以停止或解除安裝",
    $Title, 'OK', 'Information') | Out-Null
} catch {
  [System.Windows.Forms.MessageBox]::Show("安裝失敗：$($_.Exception.Message)", $Title, 'OK', 'Error') | Out-Null
  exit 1
}
