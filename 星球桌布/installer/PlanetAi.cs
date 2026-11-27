// PlanetAi: local AI service and security gateway for the planet wallpaper (compiled together with LPW by lpw.ps1).
// C# 5 only (Windows PowerShell 5.1 Add-Type). No content of conversations, recordings or tokens is ever logged.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

public sealed class AiResponse {
  public int Code = 200; public string Type = "application/json; charset=utf-8"; public byte[] Body = new byte[0];
  public static AiResponse Json(int code, string json) { var r = new AiResponse(); r.Code = code; r.Body = Encoding.UTF8.GetBytes(json); return r; }
}

public static class PlanetAi {
  public const string Origin = "http://127.0.0.1:47826";
  public const string HostName = "127.0.0.1:47826";
  public static readonly string SessionToken = NewToken();
  static string root, logFile;
  static readonly object sync = new object();
  static readonly JavaScriptSerializer json = new JavaScriptSerializer();

  // ---------- policy (machine first, then user); front-end parameters cannot change these ----------
  public static bool LockOfficial = false, AllowDevice = false, AllowCloud = false;
  public static string CloudUrl = "";
  // The regular wallpaper package has no chat page: the AI routes then stay off (only /ai/status answers).
  public static bool Enabled = false;
  static Dictionary<string, object> settings = new Dictionary<string, object>();

  static string NewToken() {
    var b = new byte[24];
    using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create()) rng.GetBytes(b);
    return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
  }

  public static void Configure(string dir, bool lockOfficial, bool allowDevice, bool allowCloud, string cloudUrl) {
    root = dir; logFile = Path.Combine(dir, "ai-log.txt");
    Enabled = File.Exists(Path.Combine(dir, "princess-chat.html"));
    LockOfficial = lockOfficial; AllowDevice = allowDevice; AllowCloud = allowCloud;
    CloudUrl = (cloudUrl ?? "").Trim();
    if (CloudUrl.Length > 0 && !Regex.IsMatch(CloudUrl, "^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~/-]*)?$")) CloudUrl = "";
    TrimLog(14);
    LoadSettings();
    MigrateData();
    Log("service.start lock=" + (LockOfficial ? 1 : 0) + " device=" + (AllowDevice ? 1 : 0) + " cloud=" + (AllowCloud ? 1 : 0) + " cloudUrl=" + (CloudUrl.Length > 0 ? 1 : 0));
  }

  // ---------- logging: time + status code only ----------
  public static void Log(string code) {
    try { lock (sync) File.AppendAllText(logFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + code + "\r\n"); } catch { }
  }
  static void TrimLog(int days) {
    try {
      if (!File.Exists(logFile)) return;
      var keep = new List<string>(); DateTime limit = DateTime.Now.AddDays(-days);
      foreach (var line in File.ReadAllLines(logFile)) {
        DateTime t; if (line.Length >= 19 && DateTime.TryParse(line.Substring(0, 19), out t) && t >= limit) keep.Add(line);
      }
      if (keep.Count > 5000) keep = keep.GetRange(keep.Count - 5000, 5000);
      File.WriteAllLines(logFile, keep.ToArray());
    } catch { }
  }
  public static void ClearLogs(string wallpaperLog) {
    try { lock (sync) { File.WriteAllText(logFile, ""); if (wallpaperLog != null && File.Exists(wallpaperLog)) File.WriteAllText(wallpaperLog, ""); } } catch { }
    Log("log.cleared");
  }

  // ---------- request gate: Host, Origin, Sec-Fetch-Site, session token ----------
  static string Header(string[] headers, string name) {
    string prefix = name + ":";
    foreach (var h in headers) if (h.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return h.Substring(prefix.Length).Trim();
    return null;
  }
  public static bool IsStatic(string path) {
    return path.StartsWith("/ai/lib/", StringComparison.Ordinal) || path.StartsWith("/ai/models/", StringComparison.Ordinal);
  }
  // Returns null when the request may continue, otherwise a short reason (logged, never echoed with content).
  public static string Gate(string method, string path, string[] headers) {
    string host = Header(headers, "Host");
    if (host == null || !host.Equals(HostName, StringComparison.OrdinalIgnoreCase)) return "host";
    if (path == "/ping") return null;
    string origin = Header(headers, "Origin");
    if (origin != null && origin != Origin) return "origin";
    string site = Header(headers, "Sec-Fetch-Site");
    // A top-level navigation to one of our own pages (for example from the open-control.html start page) is allowed;
    // other sites still cannot read anything because no response carries Access-Control-Allow-Origin.
    bool pageNav = method == "GET" && origin == null && Header(headers, "Sec-Fetch-Mode") == "navigate" &&
      (path == "/index.html" || path == "/control.html" || path == "/princess-chat.html");
    if (site != null && site != "same-origin" && site != "none" && !pageNav) return "site";
    if (method != "GET" && method != "POST") return "method";
    bool needsSession = path == "/data" || path.StartsWith("/manager-", StringComparison.Ordinal) ||
      (path.StartsWith("/ai/", StringComparison.Ordinal) && path != "/ai/feed" && !IsStatic(path));
    if (needsSession) {
      string token = Header(headers, "X-Planet-Session");
      if (token == null || !FixedEquals(token, SessionToken)) return "session";
    }
    return null;
  }
  static bool FixedEquals(string a, string b) {
    if (a.Length != b.Length) return false;
    int d = 0; for (int i = 0; i < a.Length; i++) d |= a[i] ^ b[i];
    return d == 0;
  }
  public static byte[] InjectSession(byte[] html) {
    return Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(html).Replace("__PLANET_SESSION__", SessionToken));
  }
  public static string SecurityHeaders(bool html) {
    string h = "X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nCross-Origin-Resource-Policy: same-origin\r\n";
    if (html) h += "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' blob: 'wasm-unsafe-eval'; " +
      "worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; " +
      "font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\r\nX-Frame-Options: DENY\r\n";
    return h;
  }

  // ---------- static AI files (whitelisted folders and extensions, no traversal) ----------
  public static AiResponse Static(string path) {
    if (!Regex.IsMatch(path, "^/ai/(lib|models)/[A-Za-z0-9._-]+$") || path.Contains("..")) return null;
    string file = Path.Combine(root, path.Substring(1).Replace('/', Path.DirectorySeparatorChar));
    if (!File.Exists(file)) return null;
    string ext = Path.GetExtension(file).ToLowerInvariant();
    string type = ext == ".js" ? "text/javascript; charset=utf-8" : ext == ".wasm" ? "application/wasm" :
      ext == ".gz" || ext == ".tgz" ? "application/gzip" : ext == ".json" ? "application/json; charset=utf-8" : null;
    if (type == null) return null;
    var r = new AiResponse(); r.Type = type; r.Body = File.ReadAllBytes(file); return r;
  }

  // ---------- DPAPI-protected data store (replaces plain data.json) ----------
  static readonly byte[] Entropy = Encoding.UTF8.GetBytes("PlanetWallpaper.data.v1");
  const string Magic = "PWDP1\n";
  static string DataFile { get { return Path.Combine(root, "data.dat"); } }
  static void WriteProtected(string file, string text) {
    byte[] enc = System.Security.Cryptography.ProtectedData.Protect(Encoding.UTF8.GetBytes(text), Entropy, System.Security.Cryptography.DataProtectionScope.CurrentUser);
    string tmp = file + ".tmp";
    File.WriteAllText(tmp, Magic + Convert.ToBase64String(enc), new UTF8Encoding(false));
    if (File.Exists(file)) File.Replace(tmp, file, null); else File.Move(tmp, file);
  }
  static string ReadProtected(string file) {
    string all = File.ReadAllText(file, Encoding.UTF8);
    if (!all.StartsWith(Magic, StringComparison.Ordinal)) return null;
    byte[] dec = System.Security.Cryptography.ProtectedData.Unprotect(Convert.FromBase64String(all.Substring(Magic.Length)), Entropy, System.Security.Cryptography.DataProtectionScope.CurrentUser);
    return Encoding.UTF8.GetString(dec);
  }
  public static void Backup(string reason) {
    try {
      lock (sync) {
        if (!File.Exists(DataFile)) return;
        string dir = Path.Combine(root, "backups"); Directory.CreateDirectory(dir);
        File.Copy(DataFile, Path.Combine(dir, "data-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + reason + ".dat"), true);
        var files = new List<string>(Directory.GetFiles(dir, "data-*.dat")); files.Sort();
        while (files.Count > 10) { File.Delete(files[0]); files.RemoveAt(0); }
      }
    } catch { Log("backup.error"); }
  }
  static void MigrateData() {
    string plain = Path.Combine(root, "data.json");
    try {
      lock (sync) {
        if (!File.Exists(plain)) return;
        string text = File.ReadAllText(plain, Encoding.UTF8).Trim();
        if (text.StartsWith("{") && !File.Exists(DataFile)) WriteProtected(DataFile, text);
        else if (text.StartsWith("{")) WriteProtected(DataFile + ".legacy", text);
        // Plain delete only. Overwriting the file first looks like ransomware to endpoint protection
        // (Apex One restored the file when we did that), and gives no real guarantee on SSDs anyway.
        File.Delete(plain);
      }
      Backup("migrated");
      Log("data.migrated");
    } catch { Log("data.migrate_error"); }
  }
  public static string ReadData() {
    try { lock (sync) { if (!File.Exists(DataFile)) return "{}"; return ReadProtected(DataFile) ?? "{}"; } }
    catch { Log("data.read_error"); return "{}"; }
  }
  public static bool WriteData(string text) {
    try { lock (sync) WriteProtected(DataFile, text); return true; } catch { Log("data.write_error"); return false; }
  }

  // ---------- settings (not sensitive) ----------
  static string SettingsFile { get { return Path.Combine(root, "ai-settings.json"); } }
  static void LoadSettings() {
    try { if (File.Exists(SettingsFile)) settings = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(SettingsFile, Encoding.UTF8)) ?? new Dictionary<string, object>(); }
    catch { settings = new Dictionary<string, object>(); }
    Default("mode", "official"); Default("hotkey", "Ctrl+Alt+P"); Default("subtitles", true); Default("maskTitles", false);
    Default("greetCooldown", 15); Default("greetPerHour", 2); Default("cloudConsent", false); Default("voice", "");
    if (!settings.ContainsKey("install")) settings["install"] = NewToken().Substring(0, 24);
    EnforcePolicy(); SaveSettings();
    Hotkey.Desired = Str("hotkey");
  }
  static void Default(string k, object v) { if (!settings.ContainsKey(k)) settings[k] = v; }
  static string Str(string k) { object v; return settings.TryGetValue(k, out v) && v != null ? v.ToString() : ""; }
  static bool Bool(string k) { object v; return settings.TryGetValue(k, out v) && v is bool && (bool)v; }
  static void SaveSettings() { try { File.WriteAllText(SettingsFile, json.Serialize(settings), new UTF8Encoding(false)); } catch { } }
  static void EnforcePolicy() {
    string m = Str("mode");
    if (LockOfficial || m == "device" && !AllowDevice || m == "personal" && !(AllowCloud && CloudUrl.Length > 0 && Bool("cloudConsent")) ||
        (m != "official" && m != "device" && m != "personal")) settings["mode"] = "official";
  }
  public static string Mode { get { lock (sync) return Str("mode"); } }

  // ---------- speech / subtitle feed for the wallpaper (memory only) ----------
  static string speech = "{\"seq\":0}";
  static int chatRequested;
  public static bool TakeChatRequest() { return System.Threading.Interlocked.Exchange(ref chatRequested, 0) == 1; }
  public static void RequestChat() { System.Threading.Interlocked.Exchange(ref chatRequested, 1); }

  // ---------- calendar proposals ----------
  sealed class Proposal { public string RequestId, Op, EventJson, Id; public int Rev; public DateTime Expires; }
  static readonly Dictionary<string, Proposal> proposals = new Dictionary<string, Proposal>();
  static readonly Dictionary<string, DateTime> committed = new Dictionary<string, DateTime>();
  static readonly string[] Emotions = { "idle", "blink", "happy", "talk", "shy", "star", "sad", "wow" };
  static readonly string[] PostRoutes = { "/ai/calendar/propose", "/ai/calendar/commit", "/ai/speech", "/ai/open-chat", "/ai/mode", "/ai/settings", "/ai/log/clear", "/ai/cloud" };
  static readonly string[] Gestures ={ "", "wave", "pet", "reach", "water", "stars", "thumb", "cheer", "sit" };

  static Dictionary<string, object> Calendar(out int rev) {
    rev = 0;
    var empty = new Dictionary<string, object>(); empty["events"] = new ArrayList();
    try {
      var state = json.Deserialize<Dictionary<string, object>>(LPW.WallpaperState());
      object raw; if (state == null || !state.TryGetValue("planet-wallpaper-calendar", out raw) || !(raw is string)) return empty;
      var cal = json.Deserialize<Dictionary<string, object>>((string)raw);
      if (cal == null) return empty;
      object r; if (cal.TryGetValue("rev", out r) && r is int) rev = (int)r;
      if (!cal.ContainsKey("events") || !(cal["events"] is ArrayList)) cal["events"] = new ArrayList();
      return cal;
    } catch { return empty; }
  }
  static bool ValidDate(string d) {
    DateTime t;
    return d != null && Regex.IsMatch(d, "^\\d{4}-\\d{2}-\\d{2}$") &&
      DateTime.TryParseExact(d, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out t) &&
      t.Year >= 1990 && t.Year <= 2200;
  }
  static string Err(int code, string error) { return "{\"error\":\"" + error + "\"}"; }
  static Dictionary<string, object> Parse(string body) {
    if (body == null) return null;
    try { return json.Deserialize<Dictionary<string, object>>(body); } catch { return null; }
  }
  static string S(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) && v is string ? (string)v : null; }

  static AiResponse Propose(Dictionary<string, object> req) {
    string requestId = S(req, "requestId"), op = S(req, "op");
    if (requestId == null || !Regex.IsMatch(requestId, "^[A-Za-z0-9_-]{8,64}$")) return AiResponse.Json(400, Err(400, "bad_request_id"));
    if (op != "add" && op != "update" && op != "delete") return AiResponse.Json(400, Err(400, "bad_op"));
    object evo; if (!req.TryGetValue("event", out evo) || !(evo is Dictionary<string, object>)) return AiResponse.Json(400, Err(400, "bad_event"));
    var ev = (Dictionary<string, object>)evo;
    int rev; var cal = Calendar(out rev);
    var events = (ArrayList)cal["events"];
    string id = S(ev, "id");
    Dictionary<string, object> existing = null;
    if (op != "add") {
      if (id == null || !Regex.IsMatch(id, "^[A-Za-z0-9_-]{1,48}$")) return AiResponse.Json(400, Err(400, "bad_id"));
      foreach (var e in events) { var d = e as Dictionary<string, object>; if (d != null && S(d, "id") == id) existing = d; }
      if (existing == null) return AiResponse.Json(404, Err(404, "event_not_found"));
    }
    var clean = new Dictionary<string, object>();
    if (op == "delete") { clean["id"] = id; clean["title"] = S(existing, "title") ?? ""; clean["date"] = S(existing, "date") ?? ""; clean["time"] = S(existing, "time") ?? ""; }
    else {
      string title = (S(ev, "title") ?? "").Trim(), date = S(ev, "date"), time = S(ev, "time") ?? "", color = S(ev, "color");
      if (title.Length < 1 || title.Length > 40 || Regex.IsMatch(title, "[\\u0000-\\u001f\\u007f<>]")) return AiResponse.Json(400, Err(400, "bad_title"));
      if (!ValidDate(date)) return AiResponse.Json(400, Err(400, "bad_date"));
      if (time != "" && !Regex.IsMatch(time, "^([01]\\d|2[0-3]):[0-5]\\d$")) return AiResponse.Json(400, Err(400, "bad_time"));
      if (color == null || !Regex.IsMatch(color, "^#[0-9A-Fa-f]{6}$")) color = existing != null && S(existing, "color") != null ? S(existing, "color") : "#a8432f";
      clean["id"] = op == "add" ? "ai" + DateTime.UtcNow.Ticks.ToString("x") + NewToken().Substring(0, 4) : id;
      clean["date"] = date; clean["time"] = time; clean["title"] = title; clean["color"] = color;
    }
    var p = new Proposal { RequestId = requestId, Op = op, EventJson = json.Serialize(clean), Id = (string)clean["id"], Rev = rev, Expires = DateTime.UtcNow.AddMinutes(2) };
    string token = NewToken();
    lock (sync) {
      var stale = new List<string>(); foreach (var kv in proposals) if (kv.Value.Expires < DateTime.UtcNow) stale.Add(kv.Key);
      foreach (var k in stale) proposals.Remove(k);
      if (proposals.Count >= 32) return AiResponse.Json(429, Err(429, "too_many_pending"));
      proposals[token] = p;
    }
    Log("calendar.propose " + op);
    return AiResponse.Json(200, "{\"confirmToken\":\"" + token + "\",\"expiresIn\":120,\"rev\":" + rev + ",\"event\":" + p.EventJson + "}");
  }

  static AiResponse Commit(Dictionary<string, object> req) {
    string requestId = S(req, "requestId"), token = S(req, "confirmToken");
    if (requestId == null || token == null) return AiResponse.Json(400, Err(400, "bad_request"));
    Proposal p;
    lock (sync) {
      if (committed.ContainsKey(requestId)) { Log("calendar.commit duplicate"); return AiResponse.Json(200, "{\"ok\":true,\"duplicate\":true}"); }
      if (!proposals.TryGetValue(token, out p) || p.RequestId != requestId) { Log("calendar.commit invalid_token"); return AiResponse.Json(403, Err(403, "invalid_token")); }
      proposals.Remove(token);
      if (p.Expires < DateTime.UtcNow) { Log("calendar.commit expired"); return AiResponse.Json(403, Err(403, "token_expired")); }
    }
    if (!LPW.WallpaperAlive()) { Log("calendar.commit offline"); return AiResponse.Json(503, Err(503, "wallpaper_offline")); }
    int rev; Calendar(out rev);
    if (rev != p.Rev) { Log("calendar.commit conflict"); return AiResponse.Json(409, Err(409, "calendar_changed")); }
    string command = p.Op == "add" ? "{\"a\":\"cal-add\",\"v\":" + p.EventJson + ",\"rev\":" + p.Rev + ",\"ai\":true}"
      : p.Op == "update" ? "{\"a\":\"cal-update\",\"v\":" + p.EventJson + ",\"rev\":" + p.Rev + ",\"ai\":true}"
      : "{\"a\":\"cal-remove\",\"v\":\"" + p.Id + "\",\"rev\":" + p.Rev + ",\"ai\":true}";
    if (LPW.EnqueueWallpaperCommand(command) <= 0) { Log("calendar.commit queue_full"); return AiResponse.Json(503, Err(503, "queue_unavailable")); }
    lock (sync) {
      committed[requestId] = DateTime.UtcNow;
      if (committed.Count > 256) { var oldest = new List<KeyValuePair<string, DateTime>>(committed); oldest.Sort((a, b) => a.Value.CompareTo(b.Value)); committed.Remove(oldest[0].Key); }
    }
    Log("calendar.commit " + p.Op);
    return AiResponse.Json(200, "{\"ok\":true,\"queued\":true,\"rev\":" + p.Rev + ",\"id\":\"" + p.Id + "\"}");
  }

  // ---------- routes ----------
  public static AiResponse Handle(string method, string path, string[] headers, Func<int, string> readBody, string wallpaperLog) {
    if (!Enabled && path != "/ai/status" && path != "/ai/feed") return AiResponse.Json(404, Err(404, "ai_not_installed"));
    if (path == "/ai/status" && method == "GET") {
      lock (sync) {
        EnforcePolicy();
        return AiResponse.Json(200, "{\"enabled\":" + (Enabled ? "true" : "false") + ",\"mode\":\"" + Str("mode") + "\",\"locked\":" + (LockOfficial ? "true" : "false") +
          ",\"deviceAllowed\":" + (AllowDevice && !LockOfficial ? "true" : "false") +
          ",\"cloudAllowed\":" + (AllowCloud && !LockOfficial ? "true" : "false") +
          ",\"cloudConfigured\":" + (CloudUrl.Length > 0 ? "true" : "false") +
          ",\"hotkeyActive\":" + (Hotkey.Active ? "true" : "false") +
          ",\"settings\":" + json.Serialize(PublicSettings()) + "}");
      }
    }
    if (path == "/ai/calendar" && method == "GET") {
      int rev; var cal = Calendar(out rev);
      var outCal = new Dictionary<string, object>(); outCal["events"] = cal["events"]; outCal["rev"] = rev; outCal["alive"] = LPW.WallpaperAlive();
      return AiResponse.Json(200, json.Serialize(outCal));
    }
    if (path == "/ai/state" && method == "GET") {
      var counts = new Dictionary<string, int>(); int total = 0;
      try {
        var state = json.Deserialize<Dictionary<string, object>>(LPW.WallpaperState());
        object raw;
        if (state != null && state.TryGetValue("planet-wallpaper-planet-v1", out raw) && raw is string) {
          var planet = json.Deserialize<Dictionary<string, object>>((string)raw); object list;
          if (planet != null && planet.TryGetValue("list", out list) && list is ArrayList)
            foreach (var item in (ArrayList)list) { var d = item as Dictionary<string, object>; string t = S(d, "t"); if (t == null) continue; int n; counts.TryGetValue(t, out n); counts[t] = n + 1; total++; }
        }
      } catch { }
      return AiResponse.Json(200, "{\"residents\":" + json.Serialize(counts) + ",\"total\":" + total + ",\"alive\":" + (LPW.WallpaperAlive() ? "true" : "false") + "}");
    }
    if (Array.IndexOf(PostRoutes, path) < 0 && path != "/ai/feed") return AiResponse.Json(404, Err(404, "not_found"));
    if (method != "POST" && path != "/ai/feed") return AiResponse.Json(405, Err(405, "method"));
    if (path == "/ai/feed") {
      lock (sync) return AiResponse.Json(200, "{\"speech\":" + speech + ",\"subtitles\":" + (Bool("subtitles") ? "true" : "false") + ",\"maskTitles\":" + (Bool("maskTitles") ? "true" : "false") + "}");
    }
    var body = Parse(readBody(16384));
    if (body == null) return AiResponse.Json(400, Err(400, "bad_json"));
    if (path == "/ai/calendar/propose") return Propose(body);
    if (path == "/ai/calendar/commit") return Commit(body);
    if (path == "/ai/speech") {
      object seq; string text = S(body, "text") ?? "", emotion = S(body, "emotion") ?? "talk", gesture = S(body, "gesture") ?? "";
      if (!body.TryGetValue("seq", out seq) || !(seq is int)) return AiResponse.Json(400, Err(400, "bad_seq"));
      if (Array.IndexOf(Emotions, emotion) < 0) emotion = "talk";
      if (Array.IndexOf(Gestures, gesture) < 0) gesture = "";
      if (text.Length > 240) text = text.Substring(0, 240);
      object sp; bool speaking = body.TryGetValue("speaking", out sp) && sp is bool && (bool)sp;
      var d = new Dictionary<string, object>(); d["seq"] = seq; d["speaking"] = speaking; d["text"] = text; d["emotion"] = emotion; d["gesture"] = gesture;
      d["at"] = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
      lock (sync) speech = json.Serialize(d);
      return AiResponse.Json(200, "{\"ok\":true}");
    }
    if (path == "/ai/open-chat") { System.Threading.Interlocked.Exchange(ref chatRequested, 1); return AiResponse.Json(200, "{\"ok\":true}"); }
    if (path == "/ai/mode") {
      string mode = S(body, "mode"); object consent; bool agreed = body.TryGetValue("consent", out consent) && consent is bool && (bool)consent;
      lock (sync) {
        if (LockOfficial && mode != "official") { Log("mode.denied locked"); return AiResponse.Json(403, Err(403, "locked_by_policy")); }
        if (mode == "device" && !AllowDevice) { Log("mode.denied device"); return AiResponse.Json(403, Err(403, "device_not_allowed")); }
        if (mode == "personal" && !(AllowCloud && CloudUrl.Length > 0)) { Log("mode.denied cloud"); return AiResponse.Json(403, Err(403, "cloud_not_enabled")); }
        if (mode == "personal" && !agreed) return AiResponse.Json(400, Err(400, "consent_required"));
        if (mode != "official" && mode != "device" && mode != "personal") return AiResponse.Json(400, Err(400, "bad_mode"));
        settings["mode"] = mode; if (mode == "personal") settings["cloudConsent"] = true; SaveSettings();
      }
      Log("mode.set " + mode);
      return AiResponse.Json(200, "{\"ok\":true,\"mode\":\"" + mode + "\"}");
    }
    if (path == "/ai/settings") {
      lock (sync) {
        string hk = S(body, "hotkey");
        if (hk != null) { if (!Hotkey.Valid(hk)) return AiResponse.Json(400, Err(400, "bad_hotkey")); settings["hotkey"] = hk; Hotkey.Desired = hk; }
        foreach (var k in new[] { "subtitles", "maskTitles" }) { object v; if (body.TryGetValue(k, out v) && v is bool) settings[k] = v; }
        foreach (var k in new[] { "greetCooldown", "greetPerHour" }) { object v; if (body.TryGetValue(k, out v) && v is int && (int)v >= (k == "greetCooldown" ? 15 : 0) && (int)v <= (k == "greetCooldown" ? 240 : 2)) settings[k] = v; }
        string voice = S(body, "voice"); if (voice != null && voice.Length <= 120 && !Regex.IsMatch(voice, "[\\u0000-\\u001f<>]")) settings["voice"] = voice;
        SaveSettings();
        return AiResponse.Json(200, "{\"ok\":true,\"settings\":" + json.Serialize(PublicSettings()) + "}");
      }
    }
    if (path == "/ai/log/clear") { ClearLogs(wallpaperLog); return AiResponse.Json(200, "{\"ok\":true}"); }
    if (path == "/ai/cloud") return Cloud(body);
    return AiResponse.Json(404, Err(404, "not_found"));
  }
  static Dictionary<string, object> PublicSettings() {
    var d = new Dictionary<string, object>();
    foreach (var k in new[] { "mode", "hotkey", "subtitles", "maskTitles", "greetCooldown", "greetPerHour", "voice" }) { object v; if (settings.TryGetValue(k, out v)) d[k] = v; }
    return d;
  }

  // ---------- L3 cloud gateway (optional; disabled unless policy allows, a gateway URL is set and the user consented) ----------
  static AiResponse Cloud(Dictionary<string, object> body) {
    string url, install;
    lock (sync) {
      EnforcePolicy();
      if (Str("mode") != "personal" || !AllowCloud || LockOfficial || CloudUrl.Length == 0) { Log("cloud.blocked"); return AiResponse.Json(403, Err(403, "cloud_disabled")); }
      url = CloudUrl; install = Str("install");
    }
    string text = S(body, "text") ?? "";
    if (text.Length < 1 || text.Length > 500) return AiResponse.Json(400, Err(400, "bad_text"));
    // only the single question is sent: no history, no calendar, no local state
    string payload = "{\"text\":" + json.Serialize(text) + ",\"install\":\"" + install + "\"}";
    for (int attempt = 0; attempt < 2; attempt++) {
      try {
        var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(url);
        req.Method = "POST"; req.ContentType = "application/json"; req.Timeout = 15000; req.ReadWriteTimeout = 15000; req.AllowAutoRedirect = false;
        byte[] data = Encoding.UTF8.GetBytes(payload);
        using (var s = req.GetRequestStream()) s.Write(data, 0, data.Length);
        using (var res = (System.Net.HttpWebResponse)req.GetResponse())
        using (var reader = new StreamReader(res.GetResponseStream(), Encoding.UTF8)) {
          char[] buf = new char[8192]; int n = reader.Read(buf, 0, buf.Length);
          var answer = Parse(new string(buf, 0, n)); string reply = S(answer, "reply");
          if (reply == null) { Log("cloud.bad_reply"); return AiResponse.Json(502, Err(502, "bad_reply")); }
          if (reply.Length > 600) reply = reply.Substring(0, 600);
          Log("cloud.ok");
          return AiResponse.Json(200, "{\"reply\":" + json.Serialize(reply) + "}");
        }
      } catch (System.Net.WebException e) {
        var res = e.Response as System.Net.HttpWebResponse;
        if (res != null && (int)res.StatusCode == 429 && attempt == 0) {
          int wait; string ra = res.Headers["Retry-After"];
          if (int.TryParse(ra, out wait) && wait >= 0 && wait <= 10) { Log("cloud.retry_after"); System.Threading.Thread.Sleep(wait * 1000); continue; }
        }
        int code = res != null ? (int)res.StatusCode : 0;
        Log("cloud.fail " + (code == 0 ? "network" : code.ToString()));
        return AiResponse.Json(503, Err(503, code == 429 ? "rate_limited" : code == 0 ? "offline" : "gateway_error"));
      } catch { Log("cloud.fail error"); return AiResponse.Json(503, Err(503, "gateway_error")); }
    }
    return AiResponse.Json(503, Err(503, "rate_limited"));
  }
}

// Global hotkey (default Ctrl+Alt+P) on its own thread with a message queue.
public static class Hotkey {
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint min, uint max, uint remove);
  public static volatile string Desired = "Ctrl+Alt+P";
  public static volatile bool Active;
  static string current;
  public static bool Valid(string s) { uint m, k; return Parse(s, out m, out k); }
  static bool Parse(string s, out uint mods, out uint vk) {
    mods = 0; vk = 0;
    if (string.IsNullOrEmpty(s) || s.Length > 40) return false;
    foreach (var raw in s.Split('+')) {
      string p = raw.Trim().ToUpperInvariant();
      if (p == "CTRL" || p == "CONTROL") mods |= 2; else if (p == "ALT") mods |= 1; else if (p == "SHIFT") mods |= 4; else if (p == "WIN") mods |= 8;
      else if (p.Length == 1 && (char.IsLetterOrDigit(p[0]))) vk = p[0];
      else if (Regex.IsMatch(p, "^F([1-9]|1[0-2])$")) vk = (uint)(0x6F + int.Parse(p.Substring(1)));
      else return false;
    }
    return vk != 0 && (mods & 3) != 0;     // must include Ctrl or Alt
  }
  public static void Start() { var t = new System.Threading.Thread(Loop); t.IsBackground = true; t.Start(); }
  static void Loop() {
    while (true) {
      string want = Desired;
      if (want != current) {
        if (current != null) UnregisterHotKey(IntPtr.Zero, 1);
        uint m, k; Active = Parse(want, out m, out k) && RegisterHotKey(IntPtr.Zero, 1, m | 0x4000, k);
        current = want;
        PlanetAi.Log(Active ? "hotkey.registered" : "hotkey.unavailable");
      }
      MSG msg;
      while (PeekMessage(out msg, IntPtr.Zero, 0, 0, 1)) if (msg.message == 0x0312) PlanetAi.RequestChat();
      System.Threading.Thread.Sleep(50);
    }
  }
}
