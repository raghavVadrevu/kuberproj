import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initialsFromName } from '@/lib/user-avatar'
import { cn } from '@/lib/utils'

type UserAvatarProps = {
  pictureUrl?: string | null
  displayName?: string | null
  userSub?: string
  className?: string
  fallbackClassName?: string
  /** AI assistant bubble — gradient fallback with sparkles icon */
  isAi?: boolean
  children?: ReactNode
}

export function UserAvatar({
  pictureUrl,
  displayName,
  userSub = '',
  className,
  fallbackClassName,
  isAi,
  children,
}: UserAvatarProps) {
  const src = pictureUrl?.trim() || null
  const initials = initialsFromName(displayName, userSub)

  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
      <AvatarFallback className={cn(fallbackClassName, isAi && 'bg-gradient-to-br from-primary to-accent')}>
        {children ??
          (isAi ? (
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          ) : (
            initials
          ))}
      </AvatarFallback>
    </Avatar>
  )
}
