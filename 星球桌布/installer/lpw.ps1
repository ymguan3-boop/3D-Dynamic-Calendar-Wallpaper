# Planet wallpaper (小公主的星球) host.
#   -Action start    : serve the pages on 127.0.0.1, open them in Edge, put them behind the desktop icons
#                      on the chosen screens, keep watching
#   -Action control  : open the residents & calendar window
#   -Action stop     : stop the wallpaper and restore the normal desktop
# Display setting (primary / secondary / all) is chosen in the control window; the main wallpaper page
# publishes it in its window title "PlanetWallpaper|main|<mode>", which this script reads.
param([string]$Action = 'start')

$App          = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProfileDir   = Join-Path $App 'edge-profile'
$PidFile      = Join-Path $App 'watcher.pid'
$LogFile      = Join-Path $App 'wallpaper-log.txt'
$MainPrefix   = 'PlanetWallpaper|main'
$MirrorPrefix = 'PlanetWallpaper|mirror|'
$ControlTitle = '星球居民及行事曆管理'
# Pages are served from this machine only (127.0.0.1). The page data (residents, calendar, settings) is also
# written to data.json, because an organisation's Edge policy may clear browser storage when Edge closes.
$Port         = 47826
$BaseUrl      = "http://127.0.0.1:$Port/"

function Log($m) {
  try { [IO.File]::AppendAllText($LogFile, ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $m) + "`r`n") } catch {}
}

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class LPW {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  delegate bool MonProc(IntPtr m, IntPtr dc, ref RECT r, IntPtr d);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string w);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr after, string c, string w);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonProc cb, IntPtr d);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr res);
  [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr c, IntPtr p);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte a, uint f);
  [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h, out uint key, out byte a, out uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SystemParametersInfo(uint a, uint b, string c, uint d);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);

  // PowerShell turns $null into "" for string arguments, so null titles are passed from here
  public static IntPtr FindCls(string c) { return FindWindow(c, null); }
  public static IntPtr FindChild(IntPtr p, string c) { return FindWindowEx(p, IntPtr.Zero, c, null); }
  public static string Title(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }

  // top-level Edge windows whose title starts with the text (or equals it when exact)
  public static List<IntPtr> FindEdge(string text, bool exact) {
    var list = new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      string t = Title(h);
      if (exact ? t == text : t.StartsWith(text)) {
        var cn = new StringBuilder(64); GetClassName(h, cn, 64);
        if (cn.ToString() == "Chrome_WidgetWin_1") list.Add(h);
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }
  // ask every Edge window of these processes (top-level and the ones parented to the desktop) to close
  public static int CloseWindowsOf(uint[] pids) {
    var set = new HashSet<uint>(pids); int n = 0;
    EnumProc cb = delegate(IntPtr h, IntPtr l) {
      uint p; GetWindowThreadProcessId(h, out p);
      if (set.Contains(p)) {
        var cn = new StringBuilder(64); GetClassName(h, cn, 64);
        if (cn.ToString() == "Chrome_WidgetWin_1" && Title(h).Length > 0) { PostMessage(h, 0x10, IntPtr.Zero, IntPtr.Zero); n++; }
      }
      return true;
    };
    EnumWindows(cb, IntPtr.Zero);
    IntPtr progman = FindWindow("Progman", null);
    if (progman != IntPtr.Zero) EnumChildWindows(progman, cb, IntPtr.Zero);
    IntPtr w = IntPtr.Zero;
    while ((w = FindWindowEx(IntPtr.Zero, w, "WorkerW", null)) != IntPtr.Zero) EnumChildWindows(w, cb, IntPtr.Zero);
    return n;
  }
  // still a frameless child window (and, under Progman on 24H2, layered and fully opaque)?
  public static bool StylesOk(IntPtr h, bool raised) {
    long st = GetWindowLongPtr(h, -16).ToInt64() & 0xFFFFFFFF, ex = GetWindowLongPtr(h, -20).ToInt64() & 0xFFFFFFFF;
    if ((st & 0x40000000) == 0 || (st & 0x00C00000) != 0) return false;
    if (!raised) return true;
    uint k, f; byte a;
    return (ex & 0x80000) != 0 && GetLayeredWindowAttributes(h, out k, out a, out f) && a == 255;
  }
  // monitors as {left, top, right, bottom, isPrimary}
  public static List<int[]> Monitors() {
    var list = new List<int[]>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate(IntPtr m, IntPtr dc, ref RECT r, IntPtr d) {
      var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      GetMonitorInfo(m, ref mi);
      list.Add(new int[] { mi.rcMonitor.Left, mi.rcMonitor.Top, mi.rcMonitor.Right, mi.rcMonitor.Bottom, (mi.dwFlags & 1) != 0 ? 1 : 0 });
      return true;
    }, IntPtr.Zero);
    return list;
  }
  // Windows 10 / early Windows 11: the WorkerW that sits right after the window holding SHELLDLL_DefView
  public static IntPtr LegacyWorkerW() {
    IntPtr w = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
        w = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
      return true;
    }, IntPtr.Zero);
    return w;
  }

  // ---- tiny static server on 127.0.0.1 for the wallpaper pages (whitelisted files + /data) ----
  static System.Net.Sockets.TcpListener server; static string root;
  public static bool StartServer(string dir, int port) {
    root = dir;
    try { server = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, port); server.Start(); }
    catch { return false; }
    var t = new System.Threading.Thread(Accept); t.IsBackground = true; t.Start();
    return true;
  }
  static void Accept() {
    while (true) {
      try { var c = server.AcceptTcpClient(); System.Threading.ThreadPool.QueueUserWorkItem(delegate { Serve(c); }); }
      catch { System.Threading.Thread.Sleep(200); }
    }
  }
  static void Serve(System.Net.Sockets.TcpClient c) {
    try {
      using (c) {
        var s = c.GetStream(); s.ReadTimeout = 5000;
        var buf = new byte[16384]; int n = 0, headEnd = -1;
        while (n < buf.Length) {
          int r = s.Read(buf, n, buf.Length - n); if (r <= 0) break; n += r;
          headEnd = Encoding.ASCII.GetString(buf, 0, n).IndexOf("\r\n\r\n");
          if (headEnd >= 0) break;
        }
        if (headEnd < 0) return;
        string head0 = Encoding.ASCII.GetString(buf, 0, headEnd);
        string[] parts = head0.Split('\n')[0].Split(' ');
        string method = parts[0].Trim();
        string path = parts.Length > 1 ? parts[1].Split('?')[0] : "/";
        if (path == "/") path = "/index.html";
        byte[] body; string type = "text/html; charset=utf-8"; int code = 200;
        string dataFile = System.IO.Path.Combine(root, "data.json");
        if (path == "/data" && method == "POST") {
          int len = 0;
          foreach (string h in head0.Split('\n'))
            if (h.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase)) int.TryParse(h.Substring(15).Trim(), out len);
          if (len <= 0 || len > 2000000) { body = Encoding.ASCII.GetBytes("bad length"); type = "text/plain"; code = 400; }
          else {
            var data = new byte[len]; int have = Math.Min(n - headEnd - 4, len);
            Array.Copy(buf, headEnd + 4, data, 0, have);
            while (have < len) { int r = s.Read(data, have, len - have); if (r <= 0) break; have += r; }
            string json = Encoding.UTF8.GetString(data, 0, have).Trim();
            if (have == len && json.StartsWith("{") && json.EndsWith("}")) {
              lock (root) { string tmp = dataFile + ".tmp"; System.IO.File.WriteAllText(tmp, json, new UTF8Encoding(false));
                if (System.IO.File.Exists(dataFile)) System.IO.File.Replace(tmp, dataFile, null); else System.IO.File.Move(tmp, dataFile); }
              body = Encoding.ASCII.GetBytes("saved"); type = "text/plain";
            } else { body = Encoding.ASCII.GetBytes("bad data"); type = "text/plain"; code = 400; }
          }
        }
        else if (path == "/data") {
          string json; lock (root) { json = System.IO.File.Exists(dataFile) ? System.IO.File.ReadAllText(dataFile, Encoding.UTF8) : "{}"; }
          body = Encoding.UTF8.GetBytes(json); type = "application/json; charset=utf-8";
        }
        else if (path == "/ping") { body = Encoding.ASCII.GetBytes("ok"); type = "text/plain"; }
        else if (path == "/index.html" || path == "/control.html") body = System.IO.File.ReadAllBytes(System.IO.Path.Combine(root, path.Substring(1)));
        else { body = Encoding.ASCII.GetBytes("not found"); type = "text/plain"; code = 404; }
        string head = "HTTP/1.1 " + code + (code == 200 ? " OK" : code == 400 ? " Bad Request" : " Not Found") + "\r\nContent-Type: " + type +
          "\r\nContent-Length: " + body.Length + "\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
        var hb = Encoding.ASCII.GetBytes(head);
        s.Write(hb, 0, hb.Length); s.Write(body, 0, body.Length);
      }
    } catch { }
  }
}
'@

[void][LPW]::SetProcessDPIAware()

function Get-EdgePath {
  $c = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
  try { $c += (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction Stop).'(default)' } catch {}
  foreach ($p in $c) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}

function Start-Edge([string]$page, [string]$query, [string[]]$extra) {
  $url = $BaseUrl + $page + $query
  $edgeArgs = @(
    "--user-data-dir=`"$ProfileDir`"", "--app=`"$url`"",
    '--no-first-run', '--no-default-browser-check', '--hide-crash-restore-bubble', '--disable-session-crashed-bubble',
    '--disable-extensions', '--disable-sync', '--disable-translate',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion,Translate,msEdgeStartupBoost'
  ) + $extra
  try {
    $p = Start-Process -FilePath (Get-EdgePath) -ArgumentList $edgeArgs -PassThru -ErrorAction Stop
    Log "edge launched pid=$($p.Id) page=$page$query"
  } catch { Log "edge launch failed: $($_.Exception.Message)" }
}

function Get-OurEdge {
  @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ProfileDir) })
}
# Close Edge gracefully first so it writes the page data to disk; force-kill only what is still running afterwards.
function Stop-OurEdge {
  $procs = Get-OurEdge
  if (-not $procs.Count) { return }
  $n = [LPW]::CloseWindowsOf([uint32[]]@($procs | ForEach-Object { [uint32]$_.ProcessId }))
  for ($i = 0; $i -lt 40 -and (Get-OurEdge).Count; $i++) { Start-Sleep -Milliseconds 250 }
  $left = Get-OurEdge
  if ($left.Count) {
    Start-Sleep -Milliseconds 1500
    $left = Get-OurEdge
    $left | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  Log "edge closed (windows asked: $n, force-killed: $($left.Count))"
}

function Wait-Edge([string]$text, [bool]$exact, [int]$seconds) {
  for ($i = 0; $i -lt $seconds * 4; $i++) {
    $l = [LPW]::FindEdge($text, $exact)
    if ($l.Count -gt 0) { return $l[0] }
    Start-Sleep -Milliseconds 250
  }
  return [IntPtr]::Zero
}

# ---------- monitors ----------
function Get-Monitors {
  $list = foreach ($m in [LPW]::Monitors()) {
    [pscustomobject]@{ L = $m[0]; T = $m[1]; R = $m[2]; B = $m[3]; W = $m[2] - $m[0]; H = $m[3] - $m[1]; Primary = ($m[4] -eq 1); Key = "$($m[0])_$($m[1])_$($m[2])_$($m[3])" }
  }
  return @($list | Sort-Object @{ e = { -not $_.Primary } }, L, T)
}
function Get-Targets([string]$mode) {
  $mons = Get-Monitors
  $prim = @($mons | Where-Object Primary); if (-not $prim) { $prim = @($mons[0]) }
  $sec  = @($mons | Where-Object { -not $_.Primary })
  switch ($mode) {
    'secondary' { if ($sec.Count) { return $sec } else { return $prim } }
    'all'       { return @($prim + $sec) }
    default     { return $prim }
  }
}

# ---------- desktop layer ----------
function Get-Desktop {
  $progman = [LPW]::FindCls('Progman')
  $r = [IntPtr]::Zero
  # ask Explorer to create the WorkerW layer that sits behind the icons
  [void][LPW]::SendMessageTimeout($progman, 0x052C, [IntPtr]0xD, [IntPtr]1, 0, 1000, [ref]$r)
  [void][LPW]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$r)
  Start-Sleep -Milliseconds 400
  $defview = [LPW]::FindChild($progman, 'SHELLDLL_DefView')
  if ($defview -ne [IntPtr]::Zero) {
    # Windows 11 24H2+: icons live directly under Progman; the wallpaper goes between the icons and WorkerW
    return @{ Raised = $true; Parent = $progman; DefView = $defview; Worker = [LPW]::FindChild($progman, 'WorkerW') }
  }
  $w = [LPW]::LegacyWorkerW()
  if ($w -eq [IntPtr]::Zero) { $w = $progman }
  return @{ Raised = $false; Parent = $w; DefView = [IntPtr]::Zero; Worker = [IntPtr]::Zero }
}

function Set-Placement($h, $d, $mon) {
  $pr = New-Object LPW+RECT
  [void][LPW]::GetWindowRect($d.Parent, [ref]$pr)
  $x = $mon.L - $pr.Left; $y = $mon.T - $pr.Top
  if ($d.Raised) {
    [void][LPW]::SetWindowPos($h, $d.DefView, $x, $y, $mon.W, $mon.H, 0x10 -bor 0x20 -bor 0x40)
    if ($d.Worker -ne [IntPtr]::Zero) { [void][LPW]::SetWindowPos($d.Worker, [IntPtr]1, 0, 0, 0, 0, 0x1 -bor 0x2 -bor 0x10) }
  } else {
    [void][LPW]::SetWindowPos($h, [IntPtr]::Zero, $x, $y, $mon.W, $mon.H, 0x4 -bor 0x10 -bor 0x20 -bor 0x40)
  }
}

function Connect-Window($h, $d, $mon) {
  $st = [LPW]::GetWindowLongPtr($h, -16).ToInt64() -band 0xFFFFFFFFL
  $remove = 0x00C00000L -bor 0x00040000L -bor 0x00080000L -bor 0x00020000L -bor 0x00010000L -bor 0x80000000L
  $st = ($st -band (-bnot $remove)) -bor 0x40000000L -bor 0x10000000L    # WS_CHILD | WS_VISIBLE, no frame
  [void][LPW]::SetWindowLongPtr($h, -16, [IntPtr]$st)
  $ex = [LPW]::GetWindowLongPtr($h, -20).ToInt64() -band 0xFFFFFFFFL
  $ex = ($ex -band (-bnot 0x40000L)) -bor 0x80L -bor 0x08000000L          # tool window, no activate, off the taskbar
  if ($d.Raised) { $ex = $ex -bor 0x80000L }                              # layered (required under Progman on 24H2)
  [void][LPW]::SetWindowLongPtr($h, -20, [IntPtr]$ex)
  if ($d.Raised) { [void][LPW]::SetLayeredWindowAttributes($h, 0, 255, 2) }
  [void][LPW]::SetParent($h, $d.Parent)
  Set-Placement $h $d $mon
  Log "attached $([LPW]::Title($h)) on $($mon.Key)"
}

function Restore-Desktop {
  try {
    $wp = (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -ErrorAction Stop).WallPaper
    if ($wp -and (Test-Path $wp)) { [void][LPW]::SystemParametersInfo(0x14, 0, $wp, 3) }
  } catch {}
}

function Stop-Watcher {
  if (Test-Path $PidFile) {
    $old = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($old -and [int]$old -ne $PID) {
      $p = Get-Process -Id ([int]$old) -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -like 'powershell*') { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains((Join-Path $App 'lpw.ps1')) -and $_.CommandLine -match '-Action start' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ---------- control window: Edge opens new windows full screen (inherited from the wallpaper) ----------
$script:Fixed = @{}
function Repair-ControlWindows {
  foreach ($h in [LPW]::FindEdge($ControlTitle, $true)) {
    $k = $h.ToInt64()
    if ($script:Fixed.ContainsKey($k)) { continue }
    $script:Fixed[$k] = $true
    # Edge may reopen the window minimized if it was minimized last time; bring it back first
    if ([LPW]::IsIconic($h)) { [void][LPW]::ShowWindow($h, 9); Start-Sleep -Milliseconds 500; Log 'control window restored from minimized' }
    $r = New-Object LPW+RECT; [void][LPW]::GetWindowRect($h, [ref]$r)
    $cx = ($r.Left + $r.Right) / 2; $cy = ($r.Top + $r.Bottom) / 2
    $mon = @(Get-Monitors | Where-Object { $cx -ge $_.L -and $cx -lt $_.R -and $cy -ge $_.T -and $cy -lt $_.B })[0]
    if (-not $mon) { $mon = (Get-Monitors)[0] }
    if (($r.Right - $r.Left) -ge $mon.W -and ($r.Bottom - $r.Top) -ge $mon.H - 2) {
      [void][LPW]::PostMessage($h, 0x100, [IntPtr]0x7A, [IntPtr]0x00570001)   # F11 = leave full screen
      [void][LPW]::PostMessage($h, 0x101, [IntPtr]0x7A, [IntPtr]0xC0570001)
      Start-Sleep -Milliseconds 900
      $scale = [LPW]::GetDpiForWindow($h) / 96.0; if ($scale -le 0) { $scale = 1 }
      $w = [int](440 * $scale); $hh = [Math]::Min([int](880 * $scale), $mon.H - [int](70 * $scale))
      [void][LPW]::SetWindowPos($h, [IntPtr]::Zero, [int]($mon.L + ($mon.W - $w) / 2), [int]($mon.T + ($mon.H - $hh) / 2), $w, $hh, 0x4 -bor 0x40)
      Log 'control window resized'
    }
  }
}

# ---------- main + mirror wallpaper windows ----------
$script:State = @{}
function Open-Main {
  # Edge applies --start-fullscreen only when it starts fresh, so our other Edge windows are closed first
  Stop-OurEdge
  Start-Sleep -Milliseconds 800
  Start-Edge 'index.html' '?wallpaper' @('--start-fullscreen')
  return (Wait-Edge $MainPrefix $false 30)
}
function Get-Mode($h) {
  $parts = [LPW]::Title($h).Split('|')
  if ($parts.Count -ge 3 -and $parts[2] -in @('primary', 'secondary', 'all')) { return $parts[2] }
  return 'primary'
}

function Sync-Windows {
  $S = $script:S
  $targets = @(Get-Targets $S.Mode)
  # main window goes on the first target screen
  $t0 = $targets[0]
  if ($S.MainKey -ne $t0.Key) { Set-Placement $S.Main $S.Desk $t0; $S.MainKey = $t0.Key; Log "main on $($t0.Key) mode=$($S.Mode)" }
  $S.MainMon = $t0
  if (-not $S.MirrorMon) { $S.MirrorMon = @{} }
  # mirrors on the other target screens
  $want = @{}
  foreach ($t in ($targets | Select-Object -Skip 1)) { $want[$t.Key] = $t }
  foreach ($k in @($S.Mirrors.Keys)) {
    $h = $S.Mirrors[$k]
    if (-not $want.ContainsKey($k) -or -not [LPW]::IsWindow($h)) {
      if ([LPW]::IsWindow($h)) { [void][LPW]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero); Log "mirror closed $k" }
      $S.Mirrors.Remove($k)
    }
  }
  foreach ($k in $want.Keys) {
    if ($S.Mirrors.ContainsKey($k)) { continue }
    $title = $MirrorPrefix + $k
    $h = @([LPW]::FindEdge($title, $true))[0]
    if (-not $h) {
      Start-Edge 'index.html' "?wallpaper&mirror=$k" @()
      $h = Wait-Edge $title $true 20
    }
    if ($h -and $h -ne [IntPtr]::Zero) { Start-Sleep -Milliseconds 600; Connect-Window $h $S.Desk $want[$k]; $S.Mirrors[$k] = $h; $S.MirrorMon[$k] = $want[$k] }
    else { Log "mirror window for $k not found" }
  }
}

# Edge sometimes re-applies its full-screen layout to the wallpaper windows (for example while another
# Edge window such as the control window is dragged between screens), which pushes them off their screen.
# Checked every second: any wallpaper window that moved, resized, got hidden or lost its styles is put back.
function Restore-Placement {
  $S = $script:S
  if (-not $S -or -not $S.Desk) { return }
  $pairs = @()
  if ($S.MainMon -and [LPW]::IsWindow($S.Main)) { $pairs += ,@($S.Main, $S.MainMon, 'main') }
  if ($S.MirrorMon) { foreach ($k in @($S.Mirrors.Keys)) { $h = $S.Mirrors[$k]; if ([LPW]::IsWindow($h) -and $S.MirrorMon[$k]) { $pairs += ,@($h, $S.MirrorMon[$k], "mirror $k") } } }
  foreach ($p in $pairs) {
    $h = $p[0]; $mon = $p[1]
    $r = New-Object LPW+RECT; [void][LPW]::GetWindowRect($h, [ref]$r)
    $parent = [LPW]::GetParent($h)
    $near = { param($a, $b) [Math]::Abs($a - $b) -le 2 }
    $ok = (& $near $r.Left $mon.L) -and (& $near $r.Top $mon.T) -and (& $near $r.Right $mon.R) -and (& $near $r.Bottom $mon.B) -and
          [LPW]::IsWindowVisible($h) -and $parent -eq $S.Desk.Parent
    $stylesOk = [LPW]::StylesOk($h, $S.Desk.Raised)
    if (-not $ok -or -not $stylesOk) {
      if ($parent -ne $S.Desk.Parent -or -not $stylesOk) { [void][LPW]::ShowWindow($h, 8); Connect-Window $h $S.Desk $mon }
      else { [void][LPW]::ShowWindow($h, 8); Set-Placement $h $S.Desk $mon }
      Log "restored $($p[2]) (was [$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)] styles ok=$stylesOk)"
    }
  }
}

function Start-Session($h) {
  Start-Sleep -Milliseconds 1200
  $script:S = @{ Main = $h; Desk = (Get-Desktop); MainKey = ''; Mirrors = @{}; MirrorMon = @{}; Mode = (Get-Mode $h); Screens = '' }
  $first = @(Get-Targets $script:S.Mode)[0]
  Connect-Window $h $script:S.Desk $first; $script:S.MainKey = $first.Key
  Sync-Windows
}

switch ($Action) {
  'stop' {
    Stop-Watcher; Stop-OurEdge; Start-Sleep -Milliseconds 500; Restore-Desktop; Log 'stopped'
  }
  'control' {
    Start-Edge 'control.html' '' @('--window-size=440,880')
  }
  default {
    if (-not (Get-EdgePath)) { Log 'Microsoft Edge not found'; exit 1 }
    Stop-Watcher
    Set-Content -Path $PidFile -Value $PID
    $ok = $false
    for ($i = 0; $i -lt 10 -and -not $ok; $i++) { $ok = [LPW]::StartServer($App, $Port); if (-not $ok) { Start-Sleep -Milliseconds 500 } }
    if (-not $ok) { Log "port $Port is in use, cannot serve the wallpaper pages"; exit 1 }
    Log "serving on $BaseUrl"
    $h = Open-Main
    if (-not $h -or $h -eq [IntPtr]::Zero) { Log 'wallpaper window not found'; exit 1 }
    Start-Session $h
    $tick = 0
    while ($true) {
      Start-Sleep -Seconds 1
      Repair-ControlWindows
      Restore-Placement
      if ((++$tick % 3) -ne 0) { continue }
      $S = $script:S
      if (-not [LPW]::IsWindow($S.Main)) {
        Log 'main window lost, relaunching'
        foreach ($m in $S.Mirrors.Values) { if ([LPW]::IsWindow($m)) { [void][LPW]::PostMessage($m, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) } }
        $h = @([LPW]::FindEdge($MainPrefix, $false))[0]
        if (-not $h) { $h = Open-Main }
        if ($h -and $h -ne [IntPtr]::Zero) { Start-Session $h }
        continue
      }
      if (-not [LPW]::IsWindow($S.Desk.Parent) -or [LPW]::GetParent($S.Main) -ne $S.Desk.Parent) {
        Log 'desktop changed, re-attaching'
        $S.Desk = Get-Desktop
        $first = @(Get-Targets $S.Mode)[0]
        Connect-Window $S.Main $S.Desk $first; $S.MainKey = $first.Key; $S.MainMon = $first
        foreach ($k in @($S.Mirrors.Keys)) { $m = $S.Mirrors[$k]; if ([LPW]::IsWindow($m)) { [void][LPW]::PostMessage($m, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) } }
        $S.Mirrors = @{}; $S.MirrorMon = @{}
      }
      $mode = Get-Mode $S.Main
      $screens = (@(Get-Monitors) | ForEach-Object Key) -join ','
      if ($mode -ne $S.Mode -or $screens -ne $S.Screens) {
        if ($screens -ne $S.Screens -and $S.Screens) { Log "screens changed: $screens"; $S.MainKey = '' }
        $S.Mode = $mode; $S.Screens = $screens
        Sync-Windows
      }
    }
  }
}
