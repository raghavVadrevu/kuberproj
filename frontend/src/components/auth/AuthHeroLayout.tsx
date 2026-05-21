import type { ReactNode } from 'react'

import RotatingHeroTitle from '@/components/auth/RotatingHeroTitle'

type AuthHeroLayoutProps = {
  children: ReactNode
}

export default function AuthHeroLayout({ children }: AuthHeroLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/hero_concept.png)' }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-background/55 via-background/75 to-background/92 lg:bg-gradient-to-r lg:from-background/50 lg:via-background/72 lg:to-background/88"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.65_0.2_270_/_0.12),_transparent_55%)]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-12 xl:max-w-7xl xl:grid-cols-[minmax(0,1fr)_32rem] xl:gap-16">
          <section className="flex flex-col items-center justify-center lg:items-start lg:pr-4">
            <RotatingHeroTitle />
          </section>

          <section className="flex w-full max-w-md justify-center justify-self-center lg:max-w-none lg:justify-self-end">
            {children}
          </section>
        </div>
      </div>
    </div>
  )
}
