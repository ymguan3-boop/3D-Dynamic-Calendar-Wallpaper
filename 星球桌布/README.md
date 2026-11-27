# 星球桌布：小公主的星球

創作人 官毅明

Windows 的 3D 動態桌布。背景是宇宙和緩緩自轉、偶爾散發能量的星球，畫面正中間是月曆，右側是會自轉的小星球，上面住著小公主和會自己互動的居民。

> 本作品為個人原創，與任何既有出版品或角色無關。

## 語音對話與 Groq AI

管理首頁有「對話」、「桌布顯示」、「星球居民」與「行事曆」四個入口。AI Lite 版可點擊桌布上的小公主或按 Ctrl+Alt+P 開啟語音對話，停頓後送出。第一次使用請允許麥克風。快捷鍵可在「對話」修改，Esc 取消錄音。

預設使用本機模式。欲啟用 Groq AI，可在「對話」點選[申請免費 Groq API 金鑰](https://console.groq.com/keys)，將自己的金鑰填回同一頁後儲存，再選擇 Groq AI。金鑰以 Windows DPAPI 加密保存在目前使用者的 PlanetWallpaper/groq-key.dat。本機辨識語音及處理行事曆，只有需要雲端回答的文字送往 Groq。使用者另行選擇 Edge 線上自然女聲時，朗讀文字會送往 Microsoft。組織鎖定本機模式或明確停用雲端時優先遵守政策。

## 畫面內容
- **小公主**（Blender 建模，見 `models/build_princess.py`）
  - 長捲髮配金色皇冠。
  - 多層次的衣服：緞面外罩裙在前方開衩，露出棉布荷葉裙，外面再罩一層粉紅薄紗；泡泡袖也罩了一層紗。
  - 背後的蝴蝶結緞帶會隨風飄動。
  - 五官畫在臉上，有 8 種表情：平常、眨眼、開心、說話、害羞、星星眼、難過、驚訝。平常會隨機眨眼、變換表情，互動時配合情境。
  - 五根手指可以做出放鬆、張開、握拳、比讚、捏握等手勢。澆水時用大拇指、食指、中指拿著澆水器，壺嘴朝前。
- **小公主的互動**
  - 揮手和居民打招呼，呼喚遠處的居民過來，摸摸坐到身邊的居民。
  - 星星、水滴、玫瑰等表情泡泡使用鄉村童話風的水粉插畫。
  - 把靠近玫瑰的綿羊趕走，幫玫瑰澆水，抬頭看星星，伸手碰蝴蝶。
  - 偶爾坐下來休息。綿羊吃掉猴麵包樹苗時會比讚，流星雨來時會握拳加油。
- **星球**：玻璃罩裡的玫瑰、冒煙的火山、會點亮和熄滅的路燈、猴麵包樹、小椅子。
- **居民**：狐狸、綿羊、兔子、小蛇、小鳥、蝴蝶。牠們會散步、睡覺、相遇打招呼、吃樹苗、逃離小蛇、追蝴蝶。
- **宇宙**：星雲、閃爍的星星、帶環行星、氣態巨行星、冰藍星球、綠色雲層星球，偶爾有流星和流星雨。
- **月曆**：在桌面正中間，以月份顯示，行程以彩色標籤呈現。滑鼠停留可預覽完整標題、日期和時間，點擊可固定詳情。再點同一個行程或桌面空白處即可關閉。點擊「+N 個行程」可逐筆查看當天其餘行程。

- **和小公主說話（AI Lite 版）**：按 Ctrl+Alt+P（可在管理視窗修改），或從開始功能表「和小公主說話」開啟對話視窗。
  - 可以打字，也可以按住麥克風（或空白鍵）說話，最長 30 秒，按 Esc 取消。
  - 可以查行程、新增、修改、刪除行程。每次寫入前都會先列出內容請你按「確認」，沒確認就不會改動。
  - 也可以問現在幾點、今天幾號、星球上有哪些居民，或閒聊幾句。
  - 小公主用 Windows 內建的臺灣中文聲線說話。說話時，桌布上的小公主會張嘴、換表情和做動作；有多個螢幕時聲音只播一次。
  - 本機模式的語音辨識（Vosk）、語意判斷和語音合成都在這台電腦上執行，不連網路，也不需要任何金鑰。

## 下載與安裝（Windows 10／11）

| 版本 | 內容 | 下載 |
|---|---|---|
| 小公主 AI Lite（約 53 MB） | 動態桌布、居民、換裝、行事曆，以及小公主文字與語音對話。內含離線中文語音模型。 | [下載 AI Lite 安裝包](download/小公主AI-Lite-安裝包.zip?raw=true) |
| 星球桌布一般版（約 6 MB） | 動態桌布、居民、換裝、行事曆和 Excel 匯出。 | [下載一般版安裝包](download/星球桌布-安裝包.zip?raw=true) |

1. 選擇上方的 ZIP。若 GitHub 開啟檔案頁，按 **Download raw file** 下載。
2. 在 Windows 檔案總管對 ZIP 按右鍵，選 **解壓縮全部**。開啟解壓縮後的資料夾。
3. 雙擊 **安裝星球桌布.cmd**，等安裝完成。桌布會出現在桌面圖示後方，並在登入 Windows 時自動啟動。
4. 點擊桌布右下的木紋按鈕，或開啟桌面捷徑 **星球居民及行事曆管理**。從首頁進入「桌布顯示」、「星球居民」或「行事曆」。AI Lite 使用者可點擊桌布上的小公主或按 `Ctrl+Alt+P` 開啟對話，首次使用語音時請允許麥克風。

兩版皆需要 Microsoft Edge。AI Lite 的本機對話和語音辨識可離線使用。Groq AI 可選擇啟用，需網路與自己的 Groq API 金鑰。

**更新**：下載同一版本的新 ZIP，解壓縮後再次執行安裝程式。安裝程式會備份舊版本與資料。**停止或解除安裝**：開啟開始功能表的「星球桌布」資料夾。可用 [SHA-256 清單](download/SHA256SUMS.txt) 核對下載的套件。

### 這個程式會做的事
- 安裝到 `%LOCALAPPDATA%\PlanetWallpaper`，並在本機編譯一個小啟動程式 `PlanetWallpaper.exe`。
- 以隱藏視窗執行 PowerShell 腳本 `lpw.ps1`。Edge 的桌布視窗放在桌面圖示後方，管理視窗使用獨立的 Edge 設定檔，經由本機服務與桌布同步。
- 在 `127.0.0.1:47826` 提供網頁（只有本機能連），並檢查 Host、Origin 與工作階段金鑰，拒絕其他網站的請求。
- 居民、行事曆和設定以 Windows DPAPI（目前使用者）加密，存在安裝資料夾的 `data.dat`。舊版的 `data.json` 會自動轉換並刪除。
- 紀錄檔只寫時間和狀態代碼，不含對話或行程內容，保留 14 天。
- AI Lite 版在你點擊小公主、使用語音快捷鍵、按下「開啟語音對話」或按住麥克風時錄音。錄音只在記憶體中辨識，不存檔、不上傳。
- 升級前會自動備份到 `%LOCALAPPDATA%\PlanetWallpaper-backup`，可執行安裝資料夾裡的 `rollback.ps1` 還原上一版程式。
- 解除安裝時可以選擇保留資料（加密），重新安裝時會自動放回。

組織政策、雲端選項等資安設定見 [`SECURITY.md`](SECURITY.md)。測試結果與已知限制見 [`TEST-REPORT.md`](TEST-REPORT.md)。
- 在「啟動」資料夾建立捷徑，開機時自動執行。

**公司或學校的電腦**：防毒軟體可能把這些行為判定為可疑，請先取得資訊單位同意再安裝。

## 自行建置
需要 [Node.js](https://nodejs.org/)。

```
node build.cjs
```

第一次建置 AI Lite 版前，先取得語音模型。這一步會從 Vosk 官方網站下載 zip，驗證 SHA-256 後重新打包：

```
node tools/fetch-ai-model.cjs
```

`node build.cjs` 會產生 `dist/星球桌布-安裝包/` 和 `dist/小公主AI-Lite-安裝包/`，並在 `download/` 產生兩個 zip、`SHA256SUMS.txt` 和 `SIZES.txt`。AI Lite 版超過 100,000,000 bytes 時會直接建置失敗。其中的 `index.html` 內嵌 three.js、GLTFLoader、`princess-rig.js` 和 `models/princess.glb`。

- 修改小公主模型：`blender --background --factory-startup --python models/build_princess.py -- models`
- 本機預覽：`node serve.cjs`，再開 http://localhost:5199/index.html（開發版從 CDN 載入 three.js）。網址加上 `?close` 可以近拍檢視星球。

### 測試
- `node --test tests/ai/`：日期解析（T03）、對話流程、雲端失敗時退回本機（T05）。
- `node --test tests/security/gateway.test.mjs`：對執行中的本機服務做資安測試（T04）。
- `tests/voice/`：T02 語音測試。先用 `make-audio.ps1` 以本機聲線合成音檔，再用 `add-noise.cjs` 加入噪音，最後以 `node serve.cjs` 開啟 `tests/voice/run-t02.html`。
- `tests/perf/measure-ram.ps1`：記憶體量測。

## 第三方元件
完整清單見 [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) 和安裝包內的 `SBOM.json`。AI Lite 版另含 vosk-browser 0.0.8（Apache-2.0）、vosk-model-small-cn-0.22（Apache-2.0）和 opencc-js 1.4.2（MIT AND Apache-2.0）。
- [three.js](https://threejs.org/) r160，包含 `GLTFLoader.js`、`BufferGeometryUtils.js`（MIT License），授權見 [`vendor/LICENSE-three.js.txt`](vendor/LICENSE-three.js.txt)。
