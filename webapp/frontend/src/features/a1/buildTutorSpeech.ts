import { type A1ChatMessage } from '../../shared/api/client'

/**
 * 組出小雞老師一則回合要朗讀的文字：引導語 + 內容本體（造句逐句 / 故事 / 講解步驟）。
 * 造詞/查字/算術步驟不唸完整工具內容（太碎），只唸引導語。
 *
 * 自動朗讀（turn 抵達）與單則 bubble 的「重播」都走這裡，確保兩者唸的內容一致。
 */
type SpeakSource = {
  reply: string
  intent?: A1ChatMessage['intent']
  sentence?: A1ChatMessage['sentence']
  story?: A1ChatMessage['story']
  explain?: A1ChatMessage['explain']
}

export function buildTutorSpeech(src: SpeakSource): string {
  const parts: string[] = [src.reply]
  if (src.intent === 'make_sentence' && src.sentence?.sentences?.length) {
    parts.push(...src.sentence.sentences)
  } else if (
    (src.intent === 'tell_story' || src.intent === 'continue_story') &&
    src.story?.story
  ) {
    parts.push(src.story.story)
    // 接龍：把棒子交回小朋友的那句也要唸出來（讓他知道輪到他接）。
    if (src.story.prompt) parts.push(src.story.prompt)
  } else if (src.intent === 'explain' && src.explain) {
    parts.push(...src.explain.steps)
    if (src.explain.answer) parts.push(src.explain.answer)
  }
  return parts.filter(Boolean).join('。')
}

/** 從已渲染的 tutor 訊息重建朗讀文字（重播用；reply 即 message.text）。 */
export function messageSpeech(m: A1ChatMessage): string {
  return buildTutorSpeech({
    reply: m.text,
    intent: m.intent,
    sentence: m.sentence,
    story: m.story,
    explain: m.explain,
  })
}
