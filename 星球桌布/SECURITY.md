# 資安設定說明（小公主 AI Lite）

給資訊人員參考。這份說明描述 v3.0 AI Lite 版的實際行為。

## 執行架構
- 安裝在 `%LOCALAPPDATA%\PlanetWallpaper`，不需要系統管理員權限。安裝時會在本機編譯一個沒有視窗的小啟動程式 `PlanetWallpaper.exe`（未簽章）。
- `lpw.ps1`（PowerShell 5.1）在 `127.0.0.1:47826` 提供網頁，用 Edge 顯示桌布，並把視窗放到桌面圖示後方。對話視窗與管理視窗使用另一個獨立的 Edge 設定檔。
- **沒有** shell 執行、任意檔案讀取、遙測或背景錄音的功能。L1、L2、L3 任何一層都不能執行系統指令。

## 本機服務的檢查（每個請求）
| 項目 | 規則 |
|---|---|
| Host | 必須是 `127.0.0.1:47826`，用來防 DNS rebinding |
| Origin | 有帶 Origin 時必須是 `http://127.0.0.1:47826` |
| Sec-Fetch-Site | 只接受 `same-origin` 或 `none`。從別處「導覽」到三個頁面（`index.html`、`control.html`、`princess-chat.html`）是例外，但這種情況讀不到回應 |
| 方法 | 只接受 GET、POST |
| 工作階段金鑰 | `/data`、`/manager-*`、`/ai/*` 都需要 `X-Planet-Session`。金鑰每次啟動隨機產生（192 位元），只嵌在本機頁面裡，比對採固定時間 |
| CORS | 除了 `/ping`（內容只有 `ok`）以外，所有回應都不帶 `Access-Control-Allow-Origin` |
| 內容大小 | AI 介面 16 KB；資料同步 2 MB |
| 回應標頭 | CSP（`connect-src 'self'`、`frame-ancestors 'none'`、`object-src 'none'`）、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy: no-referrer` |
| 靜態檔 | 只提供 `/ai/lib/`、`/ai/models/` 下的白名單副檔名（js、wasm、gz、json），不允許路徑穿越 |

## 行事曆寫入（提案 → 確認 → 單一寫入者）
1. 對話頁送出提案（`/ai/calendar/propose`）。服務會驗證以下項目，通過後回傳 2 分鐘內有效的一次性確認權杖：
   - requestId 格式；
   - 動作白名單：add、update、delete；
   - 標題 1–40 字，不含控制字元和 `<>`；
   - 日期、時間、顏色；
   - 要修改的行程確實存在。
2. 使用者按「確認」或說「好」，對話頁再送 `/ai/calendar/commit`。服務檢查以下項目，任何一項不符就拒絕：
   - 權杖與 requestId 相符，且未過期；
   - requestId 沒有送過（重送不會寫第二次）；
   - 行事曆版本（rev）與提案當時相同，否則回 409。
3. 實際寫入由桌布頁面執行，它是唯一的寫入者。桌布寫入前會再比對一次 rev。

## 資料保護
- 居民、行事曆、設定以 DPAPI（CurrentUser，另加 entropy）加密存在 `data.dat`。
  - 舊版的明文 `data.json` 會在第一次啟動時加密轉存，再刪除明文檔。只做一般刪除，不先覆寫，以免被防毒軟體誤判為勒索行為。
  - 加密備份放在 `backups/`，保留最近 10 份。
- **限制**：Edge 設定檔的 localStorage 仍有一份明文副本（桌布頁面需要用它繪製畫面）。組織原則 `DefaultCookiesSetting=4` 會在 Edge 關閉時清除這份副本。
- 「桌面隱藏行程名稱」打開後，桌布只顯示時間和「行程」兩字。
- 紀錄檔（`ai-log.txt`、`wallpaper-log.txt`）用途是排除問題，只寫時間、狀態與錯誤代碼，不寫對話或行程內容。啟動時刪除 14 天前的紀錄，也可以在管理視窗一鍵清除。

## 語音
- 點擊公主、按語音快捷鍵或管理頁的「開啟語音對話」後開始免按錄音，也可以按住麥克風或空白鍵錄音，單段最長 30 秒，按 Esc 可以取消。
- 格式為 16 kHz 單聲道，只在記憶體中交給 Vosk（WebAssembly）辨識，不寫入磁碟，也不上傳。播放語音時會先停止錄音，避免收到自己的聲音。
- 本機模式使用 `localService === true` 的臺灣中文聲線。Groq 模式可另外同意使用 Edge 線上自然聲線，朗讀文字會送往 Microsoft。沒有本機聲線時改用文字回答。
- 語音模型閒置 20 分鐘後釋放記憶體。

## 組織原則（登錄機碼）
`HKLM\SOFTWARE\Policies\PlanetWallpaper` 優先，其次是 `HKCU\...` 下的同名機碼。前端參數無法覆蓋這些原則。

| 值 | 型別 | 預設 | 作用 |
|---|---|---|---|
| `LockOfficialMode` | DWORD | 0 | 1 = 鎖定公務模式（只用本機 L1），不能切換到其他模式 |
| `AllowCloudAI` | DWORD | 1 | 0 禁用 Groq，1 允許使用者儲存金鑰並自行同意啟用 |

預設使用本機模式。Groq AI 僅將需要雲端回答的當次問句傳送至 Groq 官方 HTTPS 端點。API 金鑰用 Windows DPAPI CurrentUser 加密儲存於 groq-key.dat，狀態介面只回傳是否已設定。行程操作在本機處理。

## 防毒軟體
本程式不會停用或規避防毒軟體。Trend Micro Apex One 等端點防護可能把「隱藏視窗執行 PowerShell」「本機編譯 exe」「開機自動執行」判定為可疑，請由資訊單位評估後再允許。
