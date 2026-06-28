import { useState, useEffect, useRef, useCallback } from 'react'
import { celebrateRandom } from '../../shared/celebrate'
import { useScore } from '../../shared/ScoreContext'
import { speakEnglish } from '../../shared/speech/tts'
import { apiClient, type QuizSummary, type A1VideoItem } from '../../shared/api/client'
import { EnglishWritingPad, type EnglishWritingPadRef } from './components/EnglishWritingPad'
import { RewardVideo } from './components/RewardVideo'
import type { A6EnglishVocabItem } from '../../../../backend/src/contracts/providers'
import { usePreferences } from '../../shared/preferences/usePreferences'
import { addXp } from '../../shared/preferences/store'

interface Props {
  onClose: () => void
  onComplete?: (summary: QuizSummary) => void
}

type Phase = 'menu' | 'loading' | 'quiz' | 'result'

export function A6VocabCard({ onClose, onComplete }: Props) {
  const { addScore } = useScore()
  const { preferences } = usePreferences()

  // 練習設定選單狀態
  const [phase, setPhase] = useState<Phase>('menu')
  const [modeSetting, setModeSetting] = useState<'trace' | 'memory'>('trace')
  const [stageSetting, setStageSetting] = useState<string>('all')
  const [gradeSetting, setGradeSetting] = useState<number>(0)
  const [countSetting, setCountSetting] = useState<number>(5)
  const [diffSliderVal, setDiffSliderVal] = useState<number>(2) // 1=Low, 2=Medium, 3=High

  // 當切換小/中/高學段時，自動將年級重置為 0 (不限)
  useEffect(() => {
    setGradeSetting(0)
  }, [stageSetting])

  // 練習過程狀態
  const [items, setItems] = useState<A6EnglishVocabItem[]>([])
  const [currentIdx, setCurrentIdx] = useState<number>(0)
  const [showHint, setShowHint] = useState<boolean>(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean>(false)
  const [wrongMessage, setWrongMessage] = useState<string | null>(null)
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null)
  const [rewardVideoIds, setRewardVideoIds] = useState<string[]>([])

  const padRef = useRef<EnglishWritingPadRef>(null)
  const writingSectionRef = useRef<HTMLDivElement>(null)
  // 寫字板自適應卡片寬度（卡片改成適應頁寬後，畫布跟著放大，不卡在中間）。
  const [padWidth, setPadWidth] = useState<number>(540)
  const currentItem = items[currentIdx]
  // 獎勵影片播放中：影片撐卡片寬、下方寫字區收起讓空間。
  const rewardPlaying = isCorrect && rewardVideoIds.length > 0

  // 計算經驗值與等級進度
  const totalXp = preferences.learning.xp ?? 0
  const level = preferences.learning.level ?? 1
  const xpInLevel = totalXp % 100

  // 啟動練習
  const handleStartPractice = async () => {
    setPhase('loading')
    setError(null)
    
    // 優先讀取使用者先前儲存的提示偏好，若無則依模式初值 (Trace=true, Memory=false)
    const savedHint = localStorage.getItem('cecelearn:a6:showHint')
    const initialHint = savedHint !== null ? savedHint === 'true' : (modeSetting === 'trace')
    setShowHint(initialHint)

    // 將難度拉桿對應至後端難度級別 (Low=easy, Medium=medium, High=hard)
    let difficulty = 'all'
    if (diffSliderVal === 1) difficulty = 'easy'
    if (diffSliderVal === 2) difficulty = 'medium'
    if (diffSliderVal === 3) difficulty = 'hard'
    
    try {
      const res = await apiClient.fetchEnglishVocabQuiz(countSetting, stageSetting, gradeSetting, difficulty)
      if (res && res.ok && Array.isArray(res.items) && res.items.length > 0) {
        setItems(res.items)
        setCurrentIdx(0)
        setPhase('quiz')
      } else {
        setError('No words found matching your selection. Please try different options!')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.')
    }
  }

  // 載入當前單字的多媒體資源
  const loadWordAssets = useCallback(async (item: A6EnglishVocabItem) => {
    setImageLoading(true)
    setImageSrc(null)
    setIsCorrect(false)
    setWrongMessage(null)
    setRewardVideoIds([])

    // 播放發音
    speakEnglish(item.word)

    // 讀取/生成插圖 (內部串接 GenBank SQLite 快取)
    try {
      const prompt = `An educational illustration of ${item.word} for children, 3d render style, clean background`
      const res = await apiClient.illustrate(prompt, item.word, 'scene')
      if (res.ok && 'imageDataUri' in res) {
        setImageSrc(res.imageDataUri)
      }
    } catch (e) {
      console.error('Failed to load image illustration:', e)
    } finally {
      setImageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (phase === 'quiz' && currentItem) {
      loadWordAssets(currentItem)
    }
  }, [phase, currentIdx, currentItem, loadWordAssets])

  // 量測寫字區寬度 → 寫字板畫布跟著卡片寬縮放（clamp 320–820）。
  useEffect(() => {
    if (phase !== 'quiz') return
    const el = writingSectionRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setPadWidth(Math.max(320, Math.min(820, Math.round(w))))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  // 提交手寫檢查
  const handleSubmit = async () => {
    if (!currentItem || !padRef.current) return

    const res = await padRef.current.verify()
    if (res.empty) {
      setWrongMessage('Please write the word first!')
      return
    }

    if (res.ok) {
      setIsCorrect(true)
      setWrongMessage(null)
      speakEnglish(currentItem.word)
      celebrateRandom()
      
      // 全域金幣與 XP 升級
      addScore(10)
      const xpResult = addXp(10)
      if (xpResult.leveledUp) {
        setLeveledUpTo(xpResult.newLevel)
      }

      // 🎬 答對後抓「信任頻道」獎勵影片：走後端找影片（已做白名單頻道過濾），
      //    取真實 videoId 再以 /embed/{id} 播放。不能用 listType=search 搜尋式嵌入
      //    ——YouTube 早已停用，會「無法播放這部影片」。抓不到就不顯示、插圖保留。
      const rewardWord = currentItem.word
      void (async () => {
        try {
          const res = await apiClient.searchVideos(`${rewardWord} for kids`, rewardWord, 15)
          if ('items' in res && res.items.length > 0) {
            // 偏好 2 分鐘內的短片（別讓小孩混太久），但放寬 fallback：沒有 2 分鐘內的，
            // 就挑「最短的那支」而非最相關的長片。全程最短優先；未知時長殿後。
            const SHORT_SEC = 120
            const dur = (it: A1VideoItem) =>
              typeof it.durationSec === 'number' && it.durationSec > 0 ? it.durationSec : Infinity
            const shortFirst = (a: A1VideoItem, b: A1VideoItem) => dur(a) - dur(b)
            const within2min = res.items.filter((it) => dur(it) <= SHORT_SEC).sort(shortFirst)
            const rest = res.items.filter((it) => dur(it) > SHORT_SEC).sort(shortFirst)
            const pick = [...within2min, ...rest]
            // 給多支候選（最短優先）：RewardVideo 逐支試播，遇「禁止站外嵌入」就換下一支。
            setRewardVideoIds(pick.map((it) => it.videoId))
          }
        } catch {
          /* 找不到獎勵影片就維持插圖，不打斷流程 */
        }
      })()
    } else {
      setWrongMessage('Keep trying! Match the spelling as closely as you can.')
    }
  }

  // 下一個單字 (自動/手動導覽)
  const handleNextWord = () => {
    if (currentIdx + 1 < items.length) {
      setCurrentIdx((prev) => prev + 1)
    } else {
      setPhase('result')
      celebrateRandom()
    }
  }

  // 上一個單字
  const handlePrevWord = () => {
    if (currentIdx > 0) {
      setCurrentIdx((prev) => prev - 1)
    }
  }

  // 重聽發音
  const handleReplaySpeech = () => {
    if (currentItem) {
      speakEnglish(currentItem.word)
    }
  }

  // 結束並上報成績至小雞老師
  const handleFinish = () => {
    if (onComplete) {
      onComplete({
        mode: 'english_vocab',
        correct: items.length,
        total: items.length,
      })
    }
    onClose()
  }

  // 回到選單
  const handleBackToMenu = () => {
    setPhase('menu')
    setError(null)
  }

  // 渲染錯誤畫面
  if (error) {
    return (
      <div className="a6-overlay">
        <div className="ui-panel a6-card" style={{ maxWidth: '400px', textAlign: 'center', padding: '32px' }}>
          <h2 style={{ color: '#dc2626', marginBottom: '16px' }}>Error</h2>
          <p style={{ color: '#64748b', marginBottom: '24px' }}>{error}</p>
          <button 
            type="button" 
            className="a6-btn-clear" 
            onClick={handleBackToMenu}
            style={{ width: '100%', padding: '12px' }}
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="a6-overlay">
      {/* 1. 設定選單畫面 */}
      {phase === 'menu' && (
        <div className="ui-panel a6-card">
          <div className="a6-header">
            <div className="a6-progress-text">Setup Practice</div>
            <button className="a6-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          
          <div className="a6-menu-container">
            <h2 className="a6-menu-title">🔤 Vocabulary Practice</h2>

            {/* 經驗值與等級進度 */}
            <div className="a6-xp-bar-container" style={{ alignSelf: 'center' }}>
              <span className="a6-xp-level-badge">LV {level}</span>
              <div className="a6-xp-progress-track">
                <div className="a6-xp-progress-fill" style={{ width: `${xpInLevel}%` }}></div>
              </div>
              <span className="a6-xp-text">{xpInLevel} / 100 XP</span>
            </div>
            
            {/* 題型選擇 */}
            <div className="a6-menu-field">
              <label className="a6-field-label">Practice Mode</label>
              <div className="a6-toggle-group">
                <button 
                  type="button" 
                  className={`a6-toggle-btn ${modeSetting === 'trace' ? 'active' : ''}`}
                  onClick={() => setModeSetting('trace')}
                >
                  ✍️ Trace Mode
                </button>
                <button 
                  type="button" 
                  className={`a6-toggle-btn ${modeSetting === 'memory' ? 'active' : ''}`}
                  onClick={() => setModeSetting('memory')}
                >
                  🧠 Memory Mode
                </button>
              </div>
            </div>
            
            {/* 範圍選擇 (小中高學段與年級) */}
            <div className="a6-menu-row">
              <div className="a6-menu-field flex-1">
                <label className="a6-field-label">School Stage</label>
                <select 
                  className="a6-select-dropdown" 
                  value={stageSetting}
                  onChange={(e) => setStageSetting(e.target.value)}
                >
                  <option value="all">🌍 All Stages</option>
                  <option value="elementary">🎒 Elementary (小學)</option>
                  <option value="junior_high">🏫 Junior High (國中)</option>
                  <option value="senior_high">🎓 Senior High (高中)</option>
                </select>
              </div>

              <div className="a6-menu-field flex-1">
                <label className="a6-field-label">Grade</label>
                <select 
                  className="a6-select-dropdown" 
                  value={gradeSetting}
                  onChange={(e) => setGradeSetting(Number(e.target.value))}
                >
                  <option value={0}>All Grades</option>
                  {stageSetting === 'elementary' && (
                    <>
                      <option value={1}>Grade 1 (一年級)</option>
                      <option value={2}>Grade 2 (二年級)</option>
                      <option value={3}>Grade 3 (三年級)</option>
                      <option value={4}>Grade 4 (四年級)</option>
                      <option value={5}>Grade 5 (五年級)</option>
                      <option value={6}>Grade 6 (六年級)</option>
                    </>
                  )}
                  {(stageSetting === 'junior_high' || stageSetting === 'senior_high') && (
                    <>
                      <option value={1}>Grade 1 (一年級)</option>
                      <option value={2}>Grade 2 (二年級)</option>
                      <option value={3}>Grade 3 (三年級)</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* 題數與難度 (拉桿樣式) */}
            <div className="a6-menu-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="a6-field-label">Question Count</label>
                <span className="a6-slider-value">{countSetting} words</span>
              </div>
              <input
                type="range"
                className="a6-slider"
                min={3}
                max={15}
                step={1}
                value={countSetting}
                onChange={(e) => setCountSetting(Number(e.target.value))}
              />
            </div>

            <div className="a6-menu-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="a6-field-label">Difficulty</label>
                <span className="a6-slider-value">
                  {diffSliderVal === 1 && '🟢 Low (低)'}
                  {diffSliderVal === 2 && '🟡 Medium (中)'}
                  {diffSliderVal === 3 && '🔴 High (高)'}
                </span>
              </div>
              <input
                type="range"
                className="a6-slider"
                min={1}
                max={3}
                step={1}
                value={diffSliderVal}
                onChange={(e) => setDiffSliderVal(Number(e.target.value))}
              />
            </div>

            <button 
              type="button" 
              className="a6-btn-start"
              onClick={handleStartPractice}
            >
              Start Practice ➔
            </button>
          </div>
        </div>
      )}

      {/* 2. 載入中畫面 */}
      {phase === 'loading' && (
        <div className="ui-panel a6-card" style={{ padding: '32px', textAlign: 'center', width: '300px' }}>
          <div className="a6-spinner" style={{ marginBottom: '16px' }}></div>
          <p style={{ color: '#64748b', fontWeight: 'bold' }}>Preparing words...</p>
        </div>
      )}

      {/* 3. 練習主畫面 */}
      {phase === 'quiz' && currentItem && (
        <div className="ui-panel a6-card">
          {/* Card Header (包含 Prev/Next 題導覽) */}
          {/* Card Header (包含 Prev/Next 題導覽與一體化進度條) */}
          <div className="a6-header">
            <div className="a6-header-left">
              <button 
                type="button" 
                onClick={handlePrevWord} 
                disabled={currentIdx === 0}
                aria-label="Previous word"
              >
                ◀
              </button>
              <span className="a6-question-count">
                Word {currentIdx + 1} / {items.length}
              </span>
              <button 
                type="button" 
                onClick={handleNextWord} 
                disabled={currentIdx === items.length - 1}
                aria-label="Next word"
              >
                ▶
              </button>
            </div>

            <div className="a6-header-center">
              <span className="a6-xp-level-badge">LV {level}</span>
              <div className="a6-xp-progress-track">
                <div className="a6-xp-progress-fill" style={{ width: `${xpInLevel}%` }}></div>
              </div>
              <span className="a6-xp-text">{xpInLevel}/100 XP</span>
            </div>

            <button className="a6-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          {/* Card Body */}
          <div className="a6-body">
            {/* Center Section: Image Card / Reward Video */}
            <div className="a6-media-section">
              {rewardPlaying ? (
                // 🎬 獎勵影片：撐到卡片寬度（16:9），取代插圖框；下方寫字區同時收起讓出空間。
                // 逐支試播，遇「擁有者禁止站外嵌入」自動換下一支，全試完才收掉露回插圖。
                <div className="a6-reward-stage">
                  <RewardVideo
                    ids={rewardVideoIds}
                    onExhausted={() => setRewardVideoIds([])}
                  />
                  <button
                    type="button"
                    className="a6-btn-listen-floating"
                    onClick={() => setRewardVideoIds([])}
                    title="Close video"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="a6-image-box" style={{ position: 'relative' }}>
                  {imageLoading ? (
                    <div className="a6-image-placeholder">
                      <div className="a6-spinner-small"></div>
                      <span>Drawing illustration...</span>
                    </div>
                  ) : imageSrc ? (
                    <img src={imageSrc} alt={currentItem.altText} className="a6-illust-img" />
                  ) : (
                    <div className="a6-image-placeholder">
                      <span>🖼️ Illustration Failed</span>
                    </div>
                  )}

                  {/* Floating Listen button in top-left corner */}
                  <button
                    type="button"
                    className="a6-btn-listen-floating"
                    onClick={handleReplaySpeech}
                    title="Listen"
                  >
                    🔊
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Section: Writing pad and letter progress */}
            <div className="a6-writing-section" ref={writingSectionRef}>
              {/* 拼字格（大小寫）一直顯示：答對播影片時也留在影片下方當複習。 */}
              {/* Spelling grid (大寫字一行，小寫字一行) */}
              <div className="a6-spelling-double-rows" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                {/* Row 1: 大寫 */}
                <div className="a6-letters-row" style={{ margin: 0, gap: '6px' }}>
                  {currentItem.word.split('').map((char, index) => {
                    const revealed = isCorrect || showHint
                    return (
                      <div 
                        key={`upper-${index}`} 
                        className={`a6-letter-tile a6-letter-tile--${isCorrect ? 'completed' : revealed ? 'completed' : 'pending'}`}
                        style={{ width: '42px', height: '42px', fontSize: '20px', borderRadius: '10px' }}
                      >
                        {revealed ? char.toUpperCase() : '?'}
                      </div>
                    )
                  })}
                </div>

                {/* Row 2: 小寫 */}
                <div className="a6-letters-row" style={{ margin: 0, gap: '6px' }}>
                  {currentItem.word.split('').map((char, index) => {
                    const revealed = isCorrect || showHint
                    return (
                      <div 
                        key={`lower-${index}`} 
                        className={`a6-letter-tile a6-letter-tile--${isCorrect ? 'completed' : revealed ? 'completed' : 'pending'}`}
                        style={{ width: '42px', height: '42px', fontSize: '20px', borderRadius: '10px' }}
                      >
                        {revealed ? char.toLowerCase() : '?'}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Handwriting guidelines drawing canvas — 播獎勵影片時收起，把空間讓給影片 */}
              {!rewardPlaying && (
                <EnglishWritingPad
                  ref={padRef}
                  word={currentItem.word}
                  showHint={showHint}
                  width={padWidth}
                  height={Math.round(padWidth / 3.4)}
                />
              )}

              {/* Feedback messages */}
              {wrongMessage && <div className="a6-feedback-error">{wrongMessage}</div>}
              {/* 播影片時影片下方留拼字複習，不顯示加分訊息 */}
              {isCorrect && !rewardPlaying && (
                <div className="a6-feedback-success">Correct! Great job! 🎉 +10 pts</div>
              )}

              {/* Actions row */}
              <div className="a6-actions-row">
                {!rewardPlaying && (
                  <>
                    <label className="a6-hint-label">
                      <input
                        type="checkbox"
                        checked={showHint}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setShowHint(checked)
                          localStorage.setItem('cecelearn:a6:showHint', String(checked))
                        }}
                      />
                      <span>Show Hint</span>
                    </label>

                    <button
                      type="button"
                      className="a6-btn-clear"
                      onClick={() => padRef.current?.clear()}
                    >
                      Clear
                    </button>
                  </>
                )}

                {!isCorrect ? (
                  <button type="button" className="a6-btn-submit" onClick={handleSubmit}>
                    Submit
                  </button>
                ) : (
                  <button type="button" className="a6-btn-next" onClick={handleNextWord}>
                    Next ➔
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. 結果清算畫面 */}
      {phase === 'result' && (
        <div className="ui-panel a6-card" style={{ maxWidth: '420px', textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏆</div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
            English Word Master!
          </h2>
          <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '32px' }}>
            Congratulations! You completed all {items.length} words and earned{' '}
            <strong style={{ color: '#ea580c' }}>{items.length * 10}</strong> coins!
          </p>
          <button 
            type="button" 
            className="a6-btn-next" 
            onClick={handleFinish} 
            style={{ width: '100%' }}
          >
            Awesome! Back to chat
          </button>
        </div>
      )}

      {/* Level Up 動畫彈窗 */}
      {leveledUpTo !== null && (
        <div className="a6-levelup-overlay" onClick={() => setLeveledUpTo(null)}>
          <div className="a6-levelup-card" onClick={(e) => e.stopPropagation()}>
            <div className="a6-levelup-stars">🌟✨🌟</div>
            <h2 className="a6-levelup-title">LEVEL UP!</h2>
            <p className="a6-levelup-text">You reached Level {leveledUpTo}!</p>
            <button 
              type="button" 
              className="a6-levelup-btn" 
              onClick={() => setLeveledUpTo(null)}
            >
              Awesome!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
