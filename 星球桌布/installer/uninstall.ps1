# 小公主的星球（星球桌布）— 解除安裝
Add-Type -AssemblyName System.Windows.Forms
$App = Split-Path -Parent $MyInvocation.MyCommand.Path
$Title = '小公主的星球'

$ans = [System.Windows.Forms.MessageBox]::Show(
  "要解除安裝星球桌布嗎？`n桌布會停止，捷徑和星球上的居民、行事曆紀錄也會一併刪除。",
  $Title, 'YesNo', 'Question')
if ($ans -ne 'Yes') { exit 0 }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $App 'lpw.ps1') -Action stop

Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) '星球桌布') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) '星球居民及行事曆管理.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) '星球桌布.lnk') -Force -ErrorAction SilentlyContinue

for ($i = 0; $i -lt 5 -and (Test-Path $App); $i++) {
  Start-Sleep -Seconds 1
  Remove-Item $App -Recurse -Force -ErrorAction SilentlyContinue
}
[System.Windows.Forms.MessageBox]::Show('星球桌布已解除安裝。', $Title, 'OK', 'Information') | Out-Null
