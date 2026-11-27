# Measure memory used by the planet wallpaper (read-only, changes nothing).
# Usage: powershell -File measure-ram.ps1 [-Seconds 60] [-Interval 5] [-Label baseline]
# Groups: wallpaper Edge profile, manager/chat Edge profile, PowerShell host.
param([int]$Seconds = 60, [int]$Interval = 5, [string]$Label = 'sample')
$app = Join-Path $env:LOCALAPPDATA 'PlanetWallpaper'
$names = @('wallpaper', 'manager', 'host')
$sum = @{}; $max = @{}; $cnt = @{}
foreach ($g in $names) { $sum[$g] = 0.0; $max[$g] = 0.0; $cnt[$g] = 0 }
$n = 0
for ($t = 0; $t -lt $Seconds; $t += $Interval) {
  $mem = @{}; foreach ($g in $names) { $mem[$g] = 0.0; $cnt[$g] = 0 }
  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($app) }
  foreach ($p in $procs) {
    $g = $null
    if ($p.Name -eq 'msedge.exe' -and $p.CommandLine.Contains('edge-profile')) { $g = 'wallpaper' }
    elseif ($p.Name -eq 'msedge.exe') { $g = 'manager' }
    elseif ($p.Name -like 'powershell*') { $g = 'host' }
    if (-not $g) { continue }
    $proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if ($proc) { $mem[$g] += $proc.PrivateMemorySize64; $cnt[$g]++ }
  }
  foreach ($g in $names) { $sum[$g] += $mem[$g]; if ($mem[$g] -gt $max[$g]) { $max[$g] = $mem[$g] } }
  $n++
  Start-Sleep -Seconds $Interval
}
$result = [ordered]@{ label = $Label; time = (Get-Date).ToString('s'); seconds = $Seconds; samples = $n }
$total = 0.0
foreach ($g in $names) {
  $avg = [math]::Round($sum[$g] / $n / 1MB, 1); $total += $avg
  $result["${g}_private_MB_avg"] = $avg
  $result["${g}_private_MB_max"] = [math]::Round($max[$g] / 1MB, 1)
  $result["${g}_processes"] = $cnt[$g]
}
$result['total_private_MB_avg'] = [math]::Round($total, 1)
[pscustomobject]$result | ConvertTo-Json
