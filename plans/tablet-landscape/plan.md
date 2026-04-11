# 平板橫向版面設計 Plan

## 問題

目前 A5 聽寫頁面是直式 (portrait) 設計：畫布上方 + 縮圖下方 + 按鈕底部。
平板橫向 (landscape) 時這個佈局完全不適用：
- 垂直空間不足，畫布被壓得很小
- 縮圖擠到幾乎不可見
- 大量水平空間浪費

## 偵測方式

- 前端 `navigator.userAgent` 偵測裝置類型
- `window.matchMedia('(orientation: landscape)')` 偵測方向
- `screen.width > screen.height` 或 `visualViewport` 判斷

## 橫向版面提案

```
┌─────────────────────────────────────────────┐
│ 希希小家教                           ☆ 0   │ header
├──────────────┬──────────────────┬────────────┤
│              │                  │    ① ②   │
│   例句/語音  │                  │    ③ ④   │
│   區域       │    畫布 □       │   縮圖     │
│              │                  │   (2×2)   │
│              │                  │            │
├──────────────┼──────────────────┼────────────┤
│ [重聽] [提示] [提交]                        │ footer
└─────────────────────────────────────────────┘
```

- 三欄佈局：左側資訊 | 中間畫布 | 右側縮圖
- 畫布佔主要空間，以可用高度為邊長
- 縮圖 2×2 grid 排在右側
- 左側可顯示例句文字、題號等（目前疊在畫布上的 overlay）

## 需要的改動

1. **裝置/方向偵測 hook** — `useDeviceLayout()` 回傳 `'portrait' | 'landscape'`
2. **WritingPad 條件渲染** — 根據 layout 切換 flex-direction
3. **ResizeObserver 計算** — 橫向時畫布以高度為主，縮圖排右側
4. **CSS media query** — `@media (orientation: landscape) and (min-width: 768px)`
5. **測試裝置** — Samsung Galaxy Tab, iPad

## 實作優先順序

1. 先加裝置偵測 log（access log 已完成）
2. 收集實際平板 access 資料
3. 根據資料設計橫向版面
4. 實作 + 測試
