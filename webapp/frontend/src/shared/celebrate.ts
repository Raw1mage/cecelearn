declare global {
  interface Window {
    confetti?: (options?: Record<string, unknown>) => Promise<void>
  }
}

/** Fire a short fireworks celebration */
export function celebrate() {
  const confetti = window.confetti
  if (!confetti) return
  const fire = confetti

  const duration = 1500
  const end = Date.now() + duration

  function frame() {
    fire({
      particleCount: 3,
      angle: 60 + Math.random() * 60,
      spread: 55,
      startVelocity: 35,
      origin: { x: Math.random() * 0.3, y: Math.random() * 0.3 + 0.5 },
      colors: ['#60a5fa', '#fbbf24', '#f87171', '#34d399', '#a78bfa'],
    })
    fire({
      particleCount: 3,
      angle: 60 + Math.random() * 60,
      spread: 55,
      startVelocity: 35,
      origin: { x: 1 - Math.random() * 0.3, y: Math.random() * 0.3 + 0.5 },
      colors: ['#60a5fa', '#fbbf24', '#f87171', '#34d399', '#a78bfa'],
    })

    if (Date.now() < end) requestAnimationFrame(frame)
  }

  frame()
}
