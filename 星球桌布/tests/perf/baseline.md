# 效能基準（加入 AI 之前）

- 量測日期：2026-11-27
- 版本：main `0f008be68b8de1e17fbb1732fd31e97b1ff7cff0`（tag `backup/main-0f008be`）

## 量測環境

| 項目 | 規格 |
|---|---|
| 作業系統 | Windows 11 Pro 10.0.26300（x64） |
| CPU | Intel Core i7-13700K（16 核／24 執行緒） |
| RAM | 63.6 GB |
| GPU | NVIDIA GeForce RTX 5060 Ti（驅動 32.0.16.1088） |
| Edge | 158.0.4370.33 |
| 螢幕 | 2 台 1920×1080，顯示設定為「同時顯示」 |
| 本機中文聲線 | Microsoft Hanhan、Yating、Zhiwei（zh-TW，OneCore）；SAPI 另有 Hanhan Desktop |

## 記憶體（安裝版實測）

用 `tests/perf/measure-ram.ps1` 量測，每 5 秒取樣一次，共 60 秒，取 Private Bytes。

| 群組 | 平均 | 最大 | 程序數 |
|---|---|---|---|
| 桌布 Edge 設定檔 | 882.2 MB | 971.0 MB | 9 |
| 管理視窗 Edge 設定檔 | 0 MB（未開啟） | 0 MB | 0 |
| PowerShell 主程式 | 88.1 MB | 88.1 MB | 1 |
| 合計 | 970.3 MB | | |

原始資料見 `baseline-ram.json`。

## 影格率（同機預覽瀏覽器）

- 環境：同一台機器的預覽瀏覽器，1920×1080，載入 `dist` 安裝包的 `index.html`。
- 方法：以 `requestAnimationFrame` 計數，每次 5 秒，共量 3 次。
- 結果：60.1、60.0、60.0 FPS。這台機器上的上限就是螢幕更新率 60 Hz。

## 注意事項

- 安裝版的桌布視窗嵌在桌面圖示後方，無法在裡面執行量測程式，所以影格率改在同機的預覽瀏覽器量測。加入 AI 後會用同樣的方法再量一次。
