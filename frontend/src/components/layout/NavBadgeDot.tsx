import { cn } from '@/lib/utils'

type NavBadgeDotProps = {
  show?: boolean
  className?: string
}

export default function NavBadgeDot({ show, className }: NavBadgeDotProps) {
  if (!show) return null
  return (
    <span
      className={cn(
        'pointer-events-none absolute z-10 h-2 w-2 rounded-full bg-destructive',
        'ring-2 ring-card lg:ring-sidebar',
        className,
      )}
      aria-hidden
    />
  )
}
