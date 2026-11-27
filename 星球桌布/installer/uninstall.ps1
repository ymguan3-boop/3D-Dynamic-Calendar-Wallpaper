# 小公主的星球（星球桌布）— 解除安裝
Add-Type -AssemblyName System.Windows.Forms
$App = Split-Path -Parent $MyInvocation.MyCommand.Path
$Title = '小公主的星球'

$ans = [System.Windows.Forms.MessageBox]::Show(
  "要解除安裝星球桌布嗎？`n桌布會停止，捷徑也會一併刪除。",
  $Title, 'YesNo', 'Question')
if ($ans -ne 'Yes') { exit 0 }
$keep = [System.Windows.Forms.MessageBox]::Show(
  "要保留星球上的居民、行事曆與對話設定嗎？`n選「是」：資料加密保留在本機，下次安裝會自動放回。`n選「否」：連同資料一起刪除。",
  $Title, 'YesNo', 'Question')

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $App 'lpw.ps1') -Action stop

Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) '星球桌布') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) '星球居民及行事曆管理.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) '星球桌布.lnk') -Force -ErrorAction SilentlyContinue

if ($keep -eq 'Yes') {
  $kept = Join-Path $env:LOCALAPPDATA 'PlanetWallpaper-kept'
  New-Item -ItemType Directory -Force $kept | Out-Null
  foreach ($f in 'data.dat', 'data.json', 'ai-settings.json', 'backups') {
    $p = Join-Path $App $f; if (Test-Path $p) { Copy-Item $p (Join-Path $kept $f) -Recurse -Force }
  }
}
for ($i = 0; $i -lt 5 -and (Test-Path $App); $i++) {
  Start-Sleep -Seconds 1
  Remove-Item $App -Recurse -Force -ErrorAction SilentlyContinue
}
[System.Windows.Forms.MessageBox]::Show('星球桌布已解除安裝。', $Title, 'OK', 'Information') | Out-Null
