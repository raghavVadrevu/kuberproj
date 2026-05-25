import { useRef, useState } from 'react'
import { Smile, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const EMOJI_GRID = [
  '😀', '😂', '🥹', '😊', '😍', '🤔', '😅', '🙌',
  '👍', '👎', '🎉', '🔥', '✨', '💯', '❤️', '💪',
  '🍕', '🍻', '☕', '🏠', '✈️', '📅', '💰', '✅',
  '❌', '👀', '🙏', '😎', '🤝', '💬', '📍', '⏰',
] as const

type ChatMessageInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onKeyUp?: () => void
  onClick?: () => void
  onBlur?: () => void
}

export default function ChatMessageInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Message your group…',
  inputRef,
  onKeyDown,
  onKeyUp,
  onClick,
  onBlur,
}: ChatMessageInputProps) {
  const [emojiOpen, setEmojiOpen] = useState(false)
  const fallbackRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? fallbackRef

  const insertEmoji = (emoji: string) => {
    const el = ref.current
    if (el) {
      const start = el.selectionStart ?? value.length
      const end = el.selectionEnd ?? value.length
      const next = value.slice(0, start) + emoji + value.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        const pos = start + emoji.length
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    } else {
      onChange(value + emoji)
    }
    setEmojiOpen(false)
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-muted-foreground"
            disabled={disabled}
            aria-label="Insert emoji"
          >
            <Smile className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-auto p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="grid grid-cols-8 gap-0.5 max-w-[16rem]">
            {EMOJI_GRID.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-accent"
                onClick={() => insertEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="relative min-w-0 flex-1">
        <Input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onClick={onClick}
          onBlur={onBlur}
          placeholder={placeholder}
          className={cn(
            'h-11 rounded-full border-border/80 bg-background pr-11',
            'focus-visible:ring-1',
          )}
          disabled={disabled}
          autoComplete="off"
        />
        <Button
          type="button"
          size="icon"
          disabled={!value.trim() || disabled}
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
          onClick={onSubmit}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
