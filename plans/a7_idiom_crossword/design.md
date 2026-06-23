# Design: a7_idiom_crossword

## Context

a7 是 cecelearn 的新遊戲模組——成語交叉填字闖關。沿用既有分層：
- 前端 `webapp/frontend/src/features/a7/`（React+TS），渲染交叉盤、處理填字互動、教學揭曉。
- 後端 `webapp/backend/src/providers/idiomCrosswordProvider.ts`（純本地演算法生成盤面）＋ `modules/a7.ts`（薄封裝）＋ `server.ts` 註冊 `/api/a7/puzzle` route。
- 契約集中 `webapp/backend/src/contracts/providers.ts`（A7* 型別）；前端 `shared/api/client.ts` 鏡像型別＋呼叫。
- 路由 `App.tsx` 掛 `/a7`。

素材：`webapp/backend/data/idioms.json`（1641 條四字成語＋例句，無釋義欄位）。

## Goals / Non-Goals

### Goals
- 演算法自動生成「保證可解」的十字交叉成語盤（≥2 成語、≥1 交叉、tray 字數=blank 數）。
- 流暢的選字→填格→校驗→過關互動，6–9 歲可用（大字、可點、可朗讀）。
- 完成成語即融入教學（例句＋可選釋義＋TTS 朗讀）。
- 零後端 API 成本（純本地演算法 + 本地 JSON）。

### Non-Goals
- 完整金幣經濟、水墨國風新樣式、手工關卡（皆 OUT）。
- 不改動 a2 既有選擇題模組。

## Decisions

- **DD-1**：交叉盤生成放後端（provider），不放前端。原因：演算法需讀 idioms.json（1641 條），且要可單元測試「保證可解」性質；前端只負責渲染與互動。
- **DD-2**：MVP 盤面規模為「2–4 條成語、1–3 個交叉點」的小型十字盤（對齊參考圖：3 條成語、十字交叉）。難度未來可由成語條數/交叉數調整。
- **DD-3**：blank 選取策略採「每條成語挖空非交叉的部分字」。交叉字一律維持為 blank 或 given 由統一規則決定（見演算法）；確保每個 blank 的正解唯一可推（其字屬於某成語的固定位置）。
- **DD-4**：tray（備選字）= 所有 blank cell 的正解字打散洗牌。MVP **不加誘答字**（避免無解歧義與 6–9 歲挫折）。後續難度可加少量誘答字（記為未來 extend）。
- **DD-5**：校驗採「填滿即比對字串相等」。單條成語所有 cell 有字時，把 cell 字依序拼接與目標成語字串比對；相等才標完成。不做逐字即時對錯提示（避免暴力試誤，保留思考）。
- **DD-6**：釋義資料 MVP **用例句兜底**（idioms.json 無釋義欄位）。教學揭曉顯示「例句」為主；釋義為可選增強——後續可接 `moeProvider`（教育部辭典）補釋義，記為 future enhancement，不阻塞 MVP。
- **DD-7**：提示（MVP 免費）每關不限次數，但每次只揭一個「尚未正確填入的 blank」。不做金幣扣費。是否限次留待實測（先不限）。
- **DD-8**：盤面以稀疏格座標表示（cells map keyed by `"r,c"`），非滿矩陣，省傳輸、好渲染。前端用 CSS grid 依 min/max row/col 佈局。
- **DD-9**：生成失敗（限定嘗試次數內排不出合法盤）顯式回 `{ok:false}`，前端顯示「再試一次」。不 silent fallback、不回殘缺盤（遵守天條）。
- **DD-10**：分數沿用既有 `ScoreContext.addScore`；過關沿用 `celebrate()`。不新增分數系統。

## 交叉排盤演算法（核心，附 taxonomy）

### Taxonomy（命名契約，禁止望文生義）

- **`IdiomEntry`**：`{ idiom: string(4字), examples: string[] }`。來源 idioms.json 的一筆。輸入給生成器的原料。完成定義：成功讀檔即成立。
- **`charIndex`**：`Map<char, IdiomEntry[]>`。代表「某個字出現在哪些成語中」。輸入：全體 IdiomEntry。輸出：字→成語清單。不允許解讀成「字頻統計」——它是反向索引，值是成語清單不是次數。
- **`Placement`**：`{ idiom, dir: 'H'|'V', r0, c0 }`。代表一條成語放在盤上的起點與方向（H=由左至右、V=由上至下）。四字成語佔 (r0,c0)..(r0,c0+3)（H）或 (r0,c0)..(r0+3,c0)（V）。完成定義：起點+方向+成語確定即成立。
- **`Board`**：`{ cells: Map<"r,c", Cell>, placements: Placement[] }`。盤面狀態。Cell 見下。完成定義：所有 placements 落定且 cells 一致無衝突。
- **`Cell`**：`{ char: string, owners: number[] }`。`char`=該格正解字；`owners`=佔用此格的 placement index 清單（長度 2 即交叉點）。不允許解讀成「玩家已填的字」——這是正解盤（solution），玩家填入狀態另存前端。
- **`crossOK(board, placement)`**：純函式。輸入 board + 待放 placement。輸出 bool：placement 與既有 cells 是否相容（重疊格的字必須相同；且不可與不相干成語並排黏連產生非預期相鄰——MVP 簡化為只檢查重疊格字相同 + 不完全重疊既有成語）。不允許解讀成「是否有交叉」——它只判相容，交叉與否另由 owners 長度看。
- **`Puzzle`**（對外契約，見 data-schema）：把 solution Board 轉成對外題目：標哪些 cell 是 given（直接顯示）、哪些是 blank（待填），加上 tray、slots（成語槽 metadata 含教學資料）。

### 演算法步驟（pseudo，taxonomy 已定義上方）

```
function generatePuzzle(db: IdiomEntry[], opts): Puzzle | null
  charIndex := buildCharIndex(db)              // 反向索引：字→成語清單

  for attempt in 1..MAX_ATTEMPTS (例如 200):
    board := emptyBoard()
    seed := pickRandom(db)                       // 第一條成語
    place(board, {idiom:seed, dir:'H', r0:0, c0:0})

    targetCount := randomInt(opts.minIdioms, opts.maxIdioms)   // 例 2..4

    while board.placements.length < targetCount:
      cand := findCrossingCandidate(board, charIndex, db)
      // findCrossingCandidate：
      //   隨機挑 board 上某既有 cell（其字 = X，方向 dirA）
      //   在 charIndex[X] 找另一條成語 idiomB（X 在 idiomB 的位置 k）
      //   令 idiomB 以垂直方向 dirB（與 dirA 正交）擺放，使其第 k 字壓在該 cell
      //   算出 placementB 的 r0,c0
      //   若 crossOK(board, placementB) → 回 placementB；否則換挑
      if cand == null: break                      // 這個 attempt 排不下去
      place(board, cand)

    if board.placements.length >= 2 and hasIntersection(board):
      return toPuzzle(board, db, opts)            // 成功

  return null                                     // MAX_ATTEMPTS 內失敗 → DD-9
```

```
function toPuzzle(board, db, opts): Puzzle
  // 1. 決定每格 given / blank
  //    規則（DD-3）：每條成語挖空「1~2 個非交叉字」當 blank；交叉點一律保留為 given
  //    （交叉點 given 可降低難度且避免一格被兩條成語的 blank 同時要求 → 簡化校驗）
  //    MVP 簡化：交叉字 given；每條成語的其餘 3 字中隨機挑 1~2 字設為 blank。
  // 2. blanks := 所有 blank cell
  // 3. tray := shuffle(blanks.map(cell => cell.char))   // 不加誘答（DD-4）
  // 4. slots := board.placements.map(p => {
  //      cells: 該成語 4 格座標序列,
  //      idiom: p.idiom,
  //      example: pickExample(db, p.idiom),   // 教學：例句
  //      meaning?: lookupMeaning(p.idiom)     // 可選（DD-6，MVP 可空）
  //    })
  // 5. cells(對外) := 每格 {r,c, char(given才帶)|null(blank), given:bool, slotIdxs:number[]}
  return { puzzleId, level, cells, tray, slots, gridBounds }
```

### 「保證可解」不變式（invariants）

- INV-1：每個 blank cell 的正解字必出現在 tray 中（tray 由 blanks 字打散，字數相等）。
- INV-2：每個交叉點字同時滿足兩條成語（crossOK 保證重疊格字相同）。
- INV-3：交叉點一律 given（DD-3 MVP），故不存在「一個 blank 同屬兩條成語且兩條要求不同字」的矛盾。
- INV-4：tray 字數 == blank 數（DD-4 無誘答）。
- 驗證手段：單元測試對 N 次生成的 Puzzle 斷言 INV-1..4；並用「把每個 blank 填回其 cell.char 後，每條 slot 拼字 == idiom」當可解性 oracle。

## Critical Files

| 檔案 | 動作 | 說明 |
|---|---|---|
| `webapp/backend/src/providers/idiomCrosswordProvider.ts` | 新增 | 交叉排盤演算法（generatePuzzle/toPuzzle/charIndex…） |
| `webapp/backend/src/modules/a7.ts` | 新增 | 薄封裝 provider.generate() |
| `webapp/backend/src/contracts/providers.ts` | 修改 | 追加 A7CrosswordPuzzle / A7Cell / A7Slot / A7Tray 等型別 + IdiomCrosswordProvider interface |
| `webapp/backend/src/server.ts` | 修改 | 註冊 `GET /api/a7/puzzle` |
| `webapp/frontend/src/shared/api/client.ts` | 修改 | 鏡像 A7 型別 + `getCrosswordPuzzle()` |
| `webapp/frontend/src/features/a7/A7Page.tsx` | 新增 | 遊戲主頁（狀態機：loading/play/result） |
| `webapp/frontend/src/features/a7/components/CrosswordBoard.tsx` | 新增 | 交叉盤渲染（CSS grid + cell） |
| `webapp/frontend/src/features/a7/components/CharTray.tsx` | 新增 | 底部備選字塊 |
| `webapp/frontend/src/features/a7/useCrossword.ts` | 新增 | 填字狀態 hook（填入/清除/校驗/提示/重置） |
| `webapp/frontend/src/App.tsx` | 修改 | 掛 `/a7` route |
| `webapp/frontend/src/styles.css` | 修改 | a7 盤面/字塊樣式（沿用主題變數） |
| `webapp/backend/data/idioms.json` | （讀） | 素材，MVP 不改 |

## Risks / Trade-offs

### Trade-offs

- **交叉點一律 given（DD-3）**：犧牲難度上限換取「無歧義保證可解」。後續可開放交叉點也當 blank（需更嚴格的 tray/校驗），記為 future。
- **tray 無誘答（DD-4）**：降低 6–9 歲挫折感，但減少挑戰性。難度系統可分級加誘答。
- **前端校驗（DD-5）**：slot.idiom 答案隨 Puzzle 下發到前端，理論上可被看原始碼「作弊」。對 6–9 歲教育情境可接受，換取零後端往返、即時回饋。若日後要防弊可改後端校驗。
- **演算法生成 vs 手工關卡**：換來無限關卡、零維護，但放棄人工編排的主題性/美感。

### Risks

- **R-1 排盤失敗率高**：交叉條件嚴苛時 MAX_ATTEMPTS 內排不出。緩解：MVP 只要 2 條成語 + 1 交叉即算合法（門檻低），且 charIndex 反向索引讓找交叉候選高效；失敗顯式回報。
- **R-2 釋義缺**：idioms.json 無釋義。緩解：DD-6 例句兜底，釋義列為 future。
- **R-3 中文無輸入法**：6–9 歲不會打字。緩解：本玩法是「點 tray 字填格」，不需鍵盤輸入（優於 a6 的填空打字）。
- **R-4 盤面相鄰黏連**：兩條平行成語貼太近會視覺上像一條。緩解：crossOK 只接受正交交叉擺放，不接受平行並排（MVP）。
- **R-5 同字多次出現**：tray 有重複字時，填到「對的字但錯的格」。緩解：校驗只看最終 slot 拼字相等，重複字填任一等價格皆可解（INV 仍成立）。

## Code Anchors（既有可重用）

- `webapp/frontend/src/shared/speech/tts.ts` → `speak(text, {id})`：教學朗讀。
- `webapp/frontend/src/shared/celebrate.ts` → `celebrate()`：過關灑花。
- `webapp/frontend/src/shared/ScoreContext.tsx` → `useScore().addScore`：加分。
- `webapp/frontend/src/shared/components/{Panel,Button}.tsx`：UI 元件。
- `webapp/backend/src/providers/idiomQuizEngine.ts`：idioms.json 讀取 + shuffle/pickRandom 模式可參照。
