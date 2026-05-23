import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

type PageLoaderProps = {
  label?: string
  className?: string
  /** full = centered block for initial page load; inline = section loader */
  variant?: 'full' | 'inline'
}

export function PageLoader({
  label = 'Loading…',
  className,
  variant = 'full',
}: PageLoaderProps) {
  if (variant === 'inline') {
    return (
      <div
        className={cn('flex items-center justify-center gap-2 py-12', className)}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Spinner className="size-5 text-primary" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex min-h-[36vh] flex-col items-center justify-center gap-3 py-16',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner className="size-9 text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
