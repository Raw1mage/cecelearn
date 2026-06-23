import { useState } from 'react'
import { setTtsEnabled } from '../speech/tts'
import { usePreferences } from '../preferences/usePreferences'

/**
 * 全站個人化設定面板（DD-6）。齒輪 → 全螢幕 overlay，四區即時寫回中央 store。
 *
 * - 所有控制項即時讀 usePreferences()、改動即 setPreference(...)（無額外「儲存」鈕）。
 * - 語音區 TTS 開關走 setTtsEnabled（寫 store 再回灌 tts module），維持「切換入口
 *   單一、module 不失步」不變式（DD-4）；rate/pitch/其餘欄位走 setPreference。
 * - 本面板只負責「能編輯偏好並寫回 store」；fontScale/theme 實際落地到根節點是第 4 區。
 */

type SettingsTab = 'voice' | 'identity' | 'learning' | 'ui'

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'voice', label: '語音', icon: '🔊' },
  { id: 'identity', label: '身份', icon: '🧒' },
  { id: 'learning', label: '學習', icon: '📚' },
  { id: 'ui', label: '介面', icon: '🎨' },
]

const GRADE_OPTIONS = ['1年級', '2年級', '3年級', '4年級', '5年級', '6年級']

const INTENT_BIAS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '不指定' },
  { value: 'lookup', label: '查字 / 造詞' },
  { value: 'sentence', label: '造句' },
  { value: 'story', label: '說故事' },
  { value: 'tutor', label: '小家教講解' },
  { value: 'math', label: '算術' },
]

const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '不指定' },
  { value: 'easy', label: '簡單' },
  { value: 'normal', label: '一般' },
  { value: 'hard', label: '挑戰' },
]

const FONT_SCALE_OPTIONS: { value: number; label: string }[] = [
  { value: 0.9, label: '小' },
  { value: 1, label: '中' },
  { value: 1.2, label: '大' },
]

type SettingsPanelProps = {
  /** 關閉 overlay。 */
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { preferences, setPreference, resetPreferences } = usePreferences()
  const [tab, setTab] = useState<SettingsTab>('voice')
  const [topicsDraft, setTopicsDraft] = useState(() => preferences.learning.topics.join('、'))

  const { voice, identity, learning, ui } = preferences

  function commitTopics(raw: string) {
    const topics = raw
      .split(/[、,，\n]/)
      .map(t => t.trim())
      .filter(t => t.length > 0)
    setPreference({ learning: { topics } })
  }

  return (
    <div
      className="app-settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="個人化設定"
      onClick={onClose}
    >
      <button
        type="button"
        className="app-settings-overlay__close"
        onClick={onClose}
        aria-label="關閉設定"
      >
        ✕
      </button>
      <div className="app-settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="app-settings-title">個人化設定</h2>

        <div className="app-settings-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`app-settings-tab${tab === t.id ? ' app-settings-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="app-settings-body">
          {tab === 'voice' && (
            <div className="app-settings-section">
              <label className="app-settings-row app-settings-row--toggle">
                <span className="app-settings-label">朗讀（TTS）</span>
                <button
                  type="button"
                  className={`app-settings-switch${voice.ttsEnabled ? ' app-settings-switch--on' : ''}`}
                  role="switch"
                  aria-checked={voice.ttsEnabled}
                  onClick={() => setTtsEnabled(!voice.ttsEnabled)}
                >
                  <span className="app-settings-switch__knob" />
                </button>
              </label>
              <label className="app-settings-row app-settings-row--toggle">
                <span className="app-settings-label">
                  半雙工模式
                  <span className="app-settings-hint">朗讀中不收音、不被旁人說話打斷（要中斷請按停止鈕）</span>
                </span>
                <button
                  type="button"
                  className={`app-settings-switch${voice.halfDuplex ? ' app-settings-switch--on' : ''}`}
                  role="switch"
                  aria-checked={voice.halfDuplex}
                  onClick={() => setPreference({ voice: { halfDuplex: !voice.halfDuplex } })}
                >
                  <span className="app-settings-switch__knob" />
                </button>
              </label>
              <label className="app-settings-row">
                <span className="app-settings-label">語速 {voice.rate.toFixed(1)}</span>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.1}
                  value={voice.rate}
                  onChange={e => setPreference({ voice: { rate: Number(e.target.value) } })}
                />
              </label>
              <label className="app-settings-row">
                <span className="app-settings-label">音調 {voice.pitch.toFixed(1)}</span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={voice.pitch}
                  onChange={e => setPreference({ voice: { pitch: Number(e.target.value) } })}
                />
              </label>
            </div>
          )}

          {tab === 'identity' && (
            <div className="app-settings-section">
              <label className="app-settings-row">
                <span className="app-settings-label">暱稱</span>
                <input
                  type="text"
                  value={identity.nickname}
                  placeholder="小朋友的名字"
                  onChange={e => setPreference({ identity: { nickname: e.target.value } })}
                />
              </label>
              <label className="app-settings-row">
                <span className="app-settings-label">年級</span>
                <select
                  value={identity.grade}
                  onChange={e => setPreference({ identity: { grade: e.target.value } })}
                >
                  <option value="">未選擇</option>
                  {GRADE_OPTIONS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {tab === 'learning' && (
            <div className="app-settings-section">
              <label className="app-settings-row">
                <span className="app-settings-label">預設想做</span>
                <select
                  value={learning.defaultIntentBias ?? ''}
                  onChange={e => setPreference({ learning: { defaultIntentBias: e.target.value } })}
                >
                  {INTENT_BIAS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="app-settings-row">
                <span className="app-settings-label">難度</span>
                <select
                  value={learning.difficulty ?? ''}
                  onChange={e => setPreference({ learning: { difficulty: e.target.value } })}
                >
                  {DIFFICULTY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="app-settings-row app-settings-row--stack">
                <span className="app-settings-label">主題興趣</span>
                <input
                  type="text"
                  value={topicsDraft}
                  placeholder="例如：恐龍、太空、昆蟲"
                  onChange={e => setTopicsDraft(e.target.value)}
                  onBlur={e => commitTopics(e.target.value)}
                />
                <span className="app-settings-hint">用「、」或逗號分隔；離開欄位即儲存。</span>
              </label>
            </div>
          )}

          {tab === 'ui' && (
            <div className="app-settings-section">
              <div className="app-settings-row app-settings-row--stack">
                <span className="app-settings-label">字級</span>
                <div className="app-settings-segment">
                  {FONT_SCALE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      className={`app-settings-segment-btn${ui.fontScale === o.value ? ' app-settings-segment-btn--active' : ''}`}
                      onClick={() => setPreference({ ui: { fontScale: o.value } })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="app-settings-row app-settings-row--toggle">
                <span className="app-settings-label">深色模式</span>
                <button
                  type="button"
                  className={`app-settings-switch${ui.theme === 'dark' ? ' app-settings-switch--on' : ''}`}
                  role="switch"
                  aria-checked={ui.theme === 'dark'}
                  onClick={() => setPreference({ ui: { theme: ui.theme === 'dark' ? 'light' : 'dark' } })}
                >
                  <span className="app-settings-switch__knob" />
                </button>
              </label>
              <label className="app-settings-row app-settings-row--toggle">
                <span className="app-settings-label">麥克風進場預設開</span>
                <button
                  type="button"
                  className={`app-settings-switch${ui.micDefaultOn ? ' app-settings-switch--on' : ''}`}
                  role="switch"
                  aria-checked={ui.micDefaultOn}
                  onClick={() => setPreference({ ui: { micDefaultOn: !ui.micDefaultOn } })}
                >
                  <span className="app-settings-switch__knob" />
                </button>
              </label>
            </div>
          )}
        </div>

        <div className="app-settings-footer">
          <button
            type="button"
            className="app-settings-reset"
            onClick={() => {
              resetPreferences()
              setTtsEnabled(true)
              setTopicsDraft('')
            }}
          >
            回復預設
          </button>
        </div>
      </div>
    </div>
  )
}
