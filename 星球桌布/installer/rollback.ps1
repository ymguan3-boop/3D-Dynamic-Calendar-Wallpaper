# 小公主的星球（星球桌布）— 還原上一版程式
# 安裝新版時，install.ps1 會把舊版程式檔與資料備份到 %LOCALAPPDATA%\PlanetWallpaper-backup\<時間>\（保留最近 3 次）。
# 這個腳本把最近一次備份的「程式檔」放回安裝資料夾並重新啟動桌布；居民、行事曆等資料維持目前的內容。
Add-Type -AssemblyName System.Windows.Forms
$App = Split-Path -Parent $MyInvocation.MyCommand.Path
$Title = '小公主的星球'
$bkRoot = Join-Path $env:LOCALAPPDATA 'PlanetWallpaper-backup'
$bk = Get-ChildItem $bkRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $bk) { [System.Windows.Forms.MessageBox]::Show('找不到可以還原的備份。', $Title, 'OK', 'Information') | Out-Null; exit 0 }
$ans = [System.Windows.Forms.MessageBox]::Show("要把程式還原成 $($bk.Name) 備份的版本嗎？`n居民與行事曆資料不會被覆蓋。", $Title, 'YesNo', 'Question')
if ($ans -ne 'Yes') { exit 0 }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $App 'lpw.ps1') -Action stop
$Program = @('index.html', 'control.html', 'open-control.html', 'princess-chat.html', 'lpw.ps1', 'PlanetAi.cs', 'uninstall.ps1')
foreach ($f in $Program) {
  $from = Join-Path $bk.FullName $f; $to = Join-Path $App $f
  if (Test-Path $from) { Copy-Item $from $to -Force }
  elseif ($f -eq 'princess-chat.html' -or $f -eq 'PlanetAi.cs') { Remove-Item $to -Force -ErrorAction SilentlyContinue }
}
$lib = Join-Path $bk.FullName 'ai\lib'
if (Test-Path $lib) { Remove-Item (Join-Path $App 'ai\lib') -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item $lib (Join-Path $App 'ai\lib') -Recurse -Force }
elseif (-not (Test-Path (Join-Path $bk.FullName 'princess-chat.html'))) { Remove-Item (Join-Path $App 'ai') -Recurse -Force -ErrorAction SilentlyContinue }
# 舊版（沒有 PlanetAi）讀的是明文 data.json：把目前加密的 data.dat 解開給舊版使用
$restored = Get-Content (Join-Path $App 'lpw.ps1') -Raw -Encoding UTF8
$dat = Join-Path $App 'data.dat'
if ($restored -notmatch 'PlanetAi' -and (Test-Path $dat)) {
  Add-Type -AssemblyName System.Security
  $all = [IO.File]::ReadAllText($dat, [Text.Encoding]::UTF8)
  if ($all.StartsWith("PWDP1`n")) {
    $plain = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($all.Substring(6)),
      [Text.Encoding]::UTF8.GetBytes('PlanetWallpaper.data.v1'), 'CurrentUser')
    [IO.File]::WriteAllText((Join-Path $App 'data.json'), [Text.Encoding]::UTF8.GetString($plain), (New-Object Text.UTF8Encoding $false))
  }
}
Start-Process (Join-Path $App 'PlanetWallpaper.exe') -ArgumentList 'start'
[System.Windows.Forms.MessageBox]::Show('已還原上一版程式，桌布會在幾秒內重新出現。', $Title, 'OK', 'Information') | Out-Null
