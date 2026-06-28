declare global {
  interface Window {
    confetti?: (options?: Record<string, unknown>) => Promise<void>
  }
}

// 所有 confetti 呼叫統一附帶 zIndex: 9999，確保粒子繪製在 .a6-overlay (z-index:1000) 之上
const Z = 9999

/** Standard side-cannons fireworks celebration */
export function celebrate() {
  const confetti = window.confetti
  if (!confetti) return

  const duration = 1500
  const end = Date.now() + duration

  function frame() {
    confetti!({
      particleCount: 3,
      angle: 60 + Math.random() * 60,
      spread: 55,
      startVelocity: 35,
      origin: { x: Math.random() * 0.3, y: Math.random() * 0.3 + 0.5 },
      colors: ['#60a5fa', '#fbbf24', '#f87171', '#34d399', '#a78bfa'],
      zIndex: Z,
    })
    confetti!({
      particleCount: 3,
      angle: 60 + Math.random() * 60,
      spread: 55,
      startVelocity: 35,
      origin: { x: 1 - Math.random() * 0.3, y: Math.random() * 0.3 + 0.5 },
      colors: ['#60a5fa', '#fbbf24', '#f87171', '#34d399', '#a78bfa'],
      zIndex: Z,
    })

    if (Date.now() < end) requestAnimationFrame(frame)
  }

  frame()
}

/** Fire a random full-screen celebration effect */
export function celebrateRandom() {
  const confetti = window.confetti
  if (!confetti) return

  const effects = [
    // 1. Center Blast (中央超級大爆炸)
    () => {
      confetti!({
        particleCount: 150,
        spread: 80,
        startVelocity: 40,
        origin: { x: 0.5, y: 0.5 },
        zIndex: Z,
      })
    },
    // 2. Confetti Rain (彩虹雨飄落)
    () => {
      const duration = 2000
      const end = Date.now() + duration
      function rainFrame() {
        confetti!({
          particleCount: 4,
          angle: 270,
          spread: 360,
          startVelocity: 15,
          origin: { x: Math.random(), y: 0 },
          zIndex: Z,
        })
        if (Date.now() < end) requestAnimationFrame(rainFrame)
      }
      rainFrame()
    },
    // 3. Double Fireworks (左右對角雙煙火)
    () => {
      confetti!({
        particleCount: 80,
        spread: 60,
        startVelocity: 30,
        origin: { x: 0.25, y: 0.4 },
        zIndex: Z,
      })
      setTimeout(() => {
        confetti!({
          particleCount: 80,
          spread: 60,
          startVelocity: 30,
          origin: { x: 0.75, y: 0.4 },
          zIndex: Z,
        })
      }, 250)
    },
    // 4. Corner Launchers (對角連續噴射炮)
    () => {
      const duration = 1200
      const end = Date.now() + duration
      function cornerFrame() {
        confetti!({
          particleCount: 4,
          angle: 45,
          spread: 45,
          startVelocity: 45,
          origin: { x: 0, y: 1 },
          zIndex: Z,
        })
        confetti!({
          particleCount: 4,
          angle: 135,
          spread: 45,
          startVelocity: 45,
          origin: { x: 1, y: 1 },
          zIndex: Z,
        })
        if (Date.now() < end) requestAnimationFrame(cornerFrame)
      }
      cornerFrame()
    },
    // 5. Starry Burst (漫天金黃小星星)
    () => {
      const defaults = { spread: 360, ticks: 50, gravity: 0, decay: 0.94, startVelocity: 30, colors: ['#FFE400', '#FFBD00', '#E89400', '#FFCA6C', '#FDFFB6'], zIndex: Z };
      confetti!({
        ...defaults,
        particleCount: 40,
        scalar: 1.2,
      });
      confetti!({
        ...defaults,
        particleCount: 20,
        scalar: 0.75,
      });
    }
  ]

  const randomIdx = Math.floor(Math.random() * effects.length)
  effects[randomIdx]()
}
