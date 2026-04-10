const tones = ['ˊ', 'ˇ', 'ˋ', '˙']

export function parseBopomofo(input: string) {
  let tone = ''
  let phonetics = input

  if (phonetics.startsWith('˙')) {
    tone = '˙'
    phonetics = phonetics.slice(1)
  } else {
    const last = phonetics.slice(-1)
    if (tones.includes(last)) {
      tone = last
      phonetics = phonetics.slice(0, -1)
    }
  }

  return {
    phonetics: phonetics.split(''),
    tone,
  }
}
