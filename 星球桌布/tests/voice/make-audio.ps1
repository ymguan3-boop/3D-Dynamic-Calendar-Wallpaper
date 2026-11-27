# T02 test audio: synthesize every sentence in sentences.txt with the local zh-TW voices of this PC.
# Output: tests/voice/out/<voice>-<nn>.wav (raw voice; noise is added later by add-noise.cjs).
# The audio is synthetic (Windows text-to-speech). It is NOT a recording of real people.
param([string]$OutDir = (Join-Path $PSScriptRoot 'out'), [string]$List = 'sentences.txt')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null
$lines = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot $List) -Encoding UTF8 | Where-Object { $_.Trim() })

# WinRT speech synthesis (OneCore voices: Hanhan, Yating, Zhiwei)
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq 'zh-TW' })
if (-not $voices.Count) { throw 'no zh-TW voices installed' }
$report = @()
foreach ($v in $voices) {
  $synth.Voice = $v
  $tag = ($v.DisplayName -replace '^Microsoft\s+', '' -split '\s')[0].ToLowerInvariant()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $stream = Await ($synth.SynthesizeTextToStreamAsync($lines[$i])) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    [void](Await ($reader.LoadAsync($size)) ([uint32]))
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    $file = Join-Path $OutDir ('{0}-{1:D2}.wav' -f $tag, ($i + 1))
    [IO.File]::WriteAllBytes($file, $bytes)
    $reader.Dispose(); $stream.Dispose()
  }
  $report += "$tag ($($v.DisplayName), $($v.Gender)): $($lines.Count) clips"
}
$report
