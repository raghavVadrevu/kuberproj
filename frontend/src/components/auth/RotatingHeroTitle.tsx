import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import { AUTH_HERO_TAGLINES } from '@/lib/auth-hero-taglines'

const ROTATE_MS = 5000
const FADE_MS = 400

export default function RotatingHeroTitle() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [motionOk, setMotionOk] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotionOk(!mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!motionOk) return

    const interval = window.setInterval(() => {
      setVisible(false)
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % AUTH_HERO_TAGLINES.length)
        setVisible(true)
      }, FADE_MS)
    }, ROTATE_MS)

    return () => window.clearInterval(interval)
  }, [motionOk])

  const line = AUTH_HERO_TAGLINES[motionOk ? index : 0]

  return (
    <div
      className={cn(
        'pointer-events-none mx-auto max-w-xl px-2 text-center lg:mx-0 lg:max-w-2xl lg:px-0 lg:text-left',
        motionOk && 'auth-hero-float',
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary/90">
        The Huddle
      </p>
      <h1
        className={cn(
          'text-2xl font-bold leading-tight tracking-tight text-foreground drop-shadow-sm sm:text-3xl lg:text-4xl xl:text-[2.75rem] xl:leading-[1.15]',
          'transition-all duration-[400ms] ease-out',
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
      >
        {line}
      </h1>
    </div>
  )
}
