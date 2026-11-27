# 第三方元件與授權

以下元件都已固定版本，並隨安裝包再散布。AI Lite 安裝包內另附 `SHA256SUMS-ai.txt`，安裝時會逐一驗證，與清單不符就停止安裝。機器可讀的清單見安裝包內的 `SBOM.json`（CycloneDX 1.5）。

| 元件 | 版本 | 授權 | 用途 | 位置 | 來源 |
|---|---|---|---|---|---|
| three.js（含 GLTFLoader、BufferGeometryUtils） | r160 | MIT | 3D 桌布 | 內嵌於 `index.html` | https://github.com/mrdoob/three.js |
| vosk-browser | 0.0.8 | Apache-2.0 | 語音辨識（WebAssembly） | `ai/lib/vosk.js` | https://github.com/ccoreilly/vosk-browser |
| 　└ 內含 Vosk API／Kaldi | — | Apache-2.0 | 語音辨識引擎 | 同上 | https://github.com/alphacep/vosk-api |
| 　└ 內含 OpenFST | — | Apache-2.0 | 解碼圖 | 同上 | https://www.openfst.org |
| 　└ 內含 uuid | 9.0.0 | MIT | 辨識器識別碼 | 同上 | https://github.com/uuidjs/uuid |
| vosk-model-small-cn-0.22 | 0.22 | Apache-2.0 | 中文語音模型 | `ai/models/vosk-model-small-cn-0.22.tar.gz` | https://alphacephei.com/vosk/models |
| opencc-js | 1.4.2 | MIT AND Apache-2.0 | 辨識結果轉臺灣繁體 | `ai/lib/opencc-cn2t.js` | https://github.com/nk2028/opencc-js |
| 　└ OpenCC 字典 | — | Apache-2.0 | 轉換字典 | 同上 | https://github.com/BYVoid/OpenCC |

## 補充說明
- **語音模型**：使用官方 zip（SHA-256 `3af8b0e7e0f835ae9d414ce5df580237a3cfb08d586c9fbbb0f7ff29ad5b14ba`），由 `tools/fetch-ai-model.cjs` 重新打包成 vosk-browser 需要的 tar.gz。打包時固定檔案順序並把時間歸零，內容沒有修改。重新打包後的 SHA-256 是 `9e3e36c37aeeaecd9863f37fbf4f539536a53af093c30d9fd1e92efb3ec256fa`。
- **授權全文**：Apache-2.0 全文在 `ai/licenses/Apache-2.0.txt`，opencc-js 的 MIT 授權在 `ai/licenses/opencc-js-LICENSE.txt`，three.js 的授權在 `LICENSE-three.js.txt`。vosk-browser 的 npm 套件沒有附授權檔，授權依其 `package.json` 標示為 Apache-2.0。
- **不隨安裝包散布的元件**：
  - 語音合成使用 Windows 已安裝的本機聲線（Microsoft Hanhan、Yating、Zhiwei），屬於作業系統的一部分。
  - 選用的 Edge 裝置端模型（Prompt API）由 Edge 提供。本程式不會觸發它下載。
  - 選用的雲端閘道（`ai/cloud-gateway/`）由使用者自行部署。
