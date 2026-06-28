import type { A6EnglishVocabItem, A6EnglishVocabResponse } from '../contracts/providers.js'

export const ENGLISH_WORDS_DB: (Omit<A6EnglishVocabItem, 'id'> & { stage: 'elementary' | 'junior_high' | 'senior_high'; grade: number })[] = [
  // Elementary
  { word: 'cat', translation: '貓咪', altText: 'A cute little cat playing with a ball', stage: 'elementary', grade: 1 },
  { word: 'dog', translation: '小狗', altText: 'A friendly puppy wagging its tail', stage: 'elementary', grade: 1 },
  { word: 'sun', translation: '太陽', altText: 'A smiling bright yellow sun', stage: 'elementary', grade: 2 },
  { word: 'milk', translation: '牛奶', altText: 'A glass of fresh white milk', stage: 'elementary', grade: 2 },
  { word: 'book', translation: '書本', altText: 'An open colorful storybook', stage: 'elementary', grade: 3 },
  { word: 'fish', translation: '魚', altText: 'A small orange goldfish swimming', stage: 'elementary', grade: 3 },
  { word: 'frog', translation: '青蛙', altText: 'A green frog sitting on a lilypad', stage: 'elementary', grade: 4 },
  { word: 'cake', translation: '蛋糕', altText: 'A delicious strawberry birthday cake', stage: 'elementary', grade: 4 },
  { word: 'apple', translation: '蘋果', altText: 'A fresh red apple', stage: 'elementary', grade: 5 },
  { word: 'kite', translation: '風箏', altText: 'A colorful kite flying in the blue sky', stage: 'elementary', grade: 5 },
  { word: 'water', translation: '水', altText: 'A glass of clean drinking water', stage: 'elementary', grade: 6 },
  { word: 'yellow', translation: '黃色', altText: 'A bright yellow color swatch', stage: 'elementary', grade: 6 },

  // Junior High
  { word: 'banana', translation: '香蕉', altText: 'A ripe yellow banana', stage: 'junior_high', grade: 1 },
  { word: 'orange', translation: '橘子', altText: 'A round orange fruit', stage: 'junior_high', grade: 1 },
  { word: 'lemon', translation: '檸檬', altText: 'A sour yellow lemon', stage: 'junior_high', grade: 1 },
  { word: 'grape', translation: '葡萄', altText: 'A bunch of purple grapes', stage: 'junior_high', grade: 2 },
  { word: 'juice', translation: '果汁', altText: 'A glass of fresh orange juice', stage: 'junior_high', grade: 2 },
  { word: 'house', translation: '房子', altText: 'A cozy small house with a chimney', stage: 'junior_high', grade: 2 },
  { word: 'pencil', translation: '鉛筆', altText: 'A yellow wooden pencil', stage: 'junior_high', grade: 3 },
  { word: 'rabbit', translation: '兔子', altText: 'A fluffy white rabbit eating a carrot', stage: 'junior_high', grade: 3 },
  { word: 'snake', translation: '蛇', altText: 'A friendly green snake curled up', stage: 'junior_high', grade: 3 },
  { word: 'tiger', translation: '老虎', altText: 'A strong tiger with orange and black stripes', stage: 'junior_high', grade: 3 },
  { word: 'monkey', translation: '猴子', altText: 'A playful monkey swinging on a branch', stage: 'junior_high', grade: 3 },
  { word: 'nest', translation: '鳥巢', altText: 'A bird nest with eggs in it', stage: 'junior_high', grade: 3 },
  { word: 'zebra', translation: '斑馬', altText: 'A zebra with black and white stripes', stage: 'junior_high', grade: 3 },
  { word: 'school', translation: '學校', altText: 'A cute red school building with a bell', stage: 'junior_high', grade: 3 },
  { word: 'guitar', translation: '吉他', altText: 'An acoustic wooden guitar', stage: 'junior_high', grade: 3 },
  { word: 'friend', translation: '朋友', altText: 'Two happy kids holding hands and smiling', stage: 'junior_high', grade: 3 },

  // Senior High
  { word: 'ice', translation: '冰塊', altText: 'Cold clear ice cubes', stage: 'senior_high', grade: 1 },
  { word: 'queen', translation: '皇后', altText: 'A smiling queen wearing a golden crown', stage: 'senior_high', grade: 1 },
  { word: 'violin', translation: '小提琴', altText: 'A classic wooden violin', stage: 'senior_high', grade: 1 },
  { word: 'elephant', translation: '大象', altText: 'A big friendly elephant', stage: 'senior_high', grade: 2 },
  { word: 'umbrella', translation: '雨傘', altText: 'A bright colorful open umbrella', stage: 'senior_high', grade: 2 },
  { word: 'computer', translation: '電腦', altText: 'A modern desktop computer with monitor', stage: 'senior_high', grade: 2 },
  { word: 'butterfly', translation: '蝴蝶', altText: 'A beautiful blue butterfly resting on a flower', stage: 'senior_high', grade: 2 },
  { word: 'dictionary', translation: '字典', altText: 'A thick book with alphabetical tabs', stage: 'senior_high', grade: 3 },
  { word: 'dinosaur', translation: '恐龍', altText: 'A friendly green cartoon dinosaur', stage: 'senior_high', grade: 3 },
  { word: 'adventure', translation: '冒險', altText: 'A small boat sailing into a sunset with a map', stage: 'senior_high', grade: 3 },
  { word: 'universe', translation: '宇宙', altText: 'Stars and planets spinning in deep space', stage: 'senior_high', grade: 3 },
  { word: 'keyboard', translation: '鍵盤', altText: 'A sleek mechanical computer keyboard', stage: 'senior_high', grade: 3 },
]

export function createA6Module() {
  return {
    generate(count: number, stage = 'all', grade = 0, difficulty = 'all'): A6EnglishVocabResponse {
      let filtered = [...ENGLISH_WORDS_DB]
      
      // 按階段篩選 (小學/國中/高中)
      if (stage !== 'all') {
        filtered = filtered.filter(item => item.stage === stage)
      }
      
      // 按年級篩選 (1-6)
      if (grade > 0) {
        filtered = filtered.filter(item => item.grade === grade)
      }
      
      // 按難度篩選 (Low=easy, Medium=medium, High=hard)
      if (difficulty !== 'all') {
        filtered = filtered.filter(item => {
          const len = item.word.length
          if (difficulty === 'easy') return len <= 4
          if (difficulty === 'medium') return len >= 5 && len <= 6
          if (difficulty === 'hard') return len >= 7
          return true
        })
      }
      
      // 退路安全機制：如果沒有對應單字則返回整個資料庫以防卡死
      if (filtered.length === 0) {
        filtered = [...ENGLISH_WORDS_DB]
      }
      
      const shuffled = filtered.sort(() => Math.random() - 0.5)
      const selected = shuffled.slice(0, Math.min(count, shuffled.length))
      
      const items = selected.map((item, index) => ({
        id: `a6-${Date.now()}-${index}`,
        word: item.word,
        translation: item.translation,
        altText: item.altText,
      }))
      
      return {
        ok: true,
        items,
      }
    }
  }
}
