import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Send, Sparkles, Users } from 'lucide-react'
import { toast } from 'sonner'

import { PageLoader } from '@/components/ui/page-loader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { GroupChatClient } from '@/lib/group-chat'
import {
  applyMention,
  buildMentionSuggestions,
  formatTypingLabel,
  getActiveMention,
  type MentionOption,
} from '@/lib/chat-mentions'
import {
  ACTIVE_GROUP_STORAGE_KEY,
  apiJson,
  resolveActiveGroupId,
  type ChatMessageDto,
  type GroupDetailDto,
  type GroupDto,
  type GroupMemberDto,
  type UserProfileDto,
} from '@/lib/api'
import { formatChatError, toastUserError } from '@/lib/user-errors'

const TYPING_STALE_MS = 3500
const TYPING_SEND_DEBOUNCE_MS = 400
const TYPING_STOP_MS = 2000

function initialsFromName(name: string | null | undefined, sub: string): string {
  if (name?.trim()) {
    const p = name.trim().split(/\s+/)
    if (p.length >= 2) return (p[0]![0] + p[1]![0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const alnum = sub.replace(/[^a-zA-Z0-9]/g, '')
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase()
  return sub.slice(0, 2).toUpperCase()
}

function memberLabel(m: GroupMemberDto): string {
  return m.display_name?.trim() || m.email?.split('@')[0] || 'Member'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ConciergePage() {
  const location = useLocation()
  const [groups, setGroups] = useState<GroupDto[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupMemberDto[]>([])
  const [meSub, setMeSub] = useState<string | null>(null)
  const [meDisplayName, setMeDisplayName] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageDto[]>([])
  const [streaming, setStreaming] = useState<Record<string, string>>({})
  const [typingAt, setTypingAt] = useState<Record<string, number>>({})
  const [inputValue, setInputValue] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatClientRef = useRef<GroupChatClient | null>(null)
  const typingSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingActiveRef = useRef(false)

  const activeMention = useMemo(
    () => getActiveMention(inputValue, cursorPos),
    [inputValue, cursorPos],
  )

  const mentionSuggestions = useMemo(() => {
    if (!activeMention) return []
    return buildMentionSuggestions(activeMention.query, members, meSub)
  }, [activeMention, members, meSub])

  const showMentions = activeMention !== null && mentionSuggestions.length > 0

  const upsertMessage = useCallback((msg: ChatMessageDto) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) {
        return prev.map((m) => (m.id === msg.id ? msg : m))
      }
      return [...prev, msg]
    })
  }, [])

  const appendAiToken = useCallback((streamId: string, chunk: string) => {
    setStreaming((prev) => ({
      ...prev,
      [streamId]: (prev[streamId] ?? '') + chunk,
    }))
  }, [])

  const clearAiStream = useCallback((streamId: string) => {
    setStreaming((prev) => {
      const next = { ...prev }
      delete next[streamId]
      return next
    })
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  useEffect(() => {
    scrollToBottom(messages.length <= 3 ? 'auto' : 'smooth')
  }, [messages, streaming, scrollToBottom])

  const memberNameBySub = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) {
      map.set(m.user_sub, memberLabel(m))
    }
    if (meSub) {
      const mine =
        meDisplayName?.trim() ||
        members.find((m) => m.user_sub === meSub)?.display_name?.trim()
      if (mine) map.set(meSub, mine)
    }
    return map
  }, [members, meSub, meDisplayName])

  const resolveSenderDisplayName = useCallback(
    (
      senderSub: string,
      senderDisplayName: string | null | undefined,
      isAi: boolean,
    ): string => {
      if (isAi) return senderDisplayName?.trim() || 'Huddle AI'
      const fromMsg = senderDisplayName?.trim()
      if (fromMsg) return fromMsg
      return memberNameBySub.get(senderSub) ?? 'Member'
    },
    [memberNameBySub],
  )

  const typingNames = useMemo(() => {
    const now = Date.now()
    return Object.entries(typingAt)
      .filter(([sub, at]) => sub !== meSub && now - at < TYPING_STALE_MS)
      .map(([sub]) => memberNameBySub.get(sub) ?? 'Someone')
  }, [typingAt, meSub, memberNameBySub])

  const typingLabel = formatTypingLabel(typingNames)

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingAt((prev) => {
        const next: Record<string, number> = {}
        let changed = false
        for (const [sub, at] of Object.entries(prev)) {
          if (now - at < TYPING_STALE_MS) {
            next[sub] = at
          } else {
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const stopTypingSignal = useCallback(() => {
    if (typingSendTimerRef.current) {
      clearTimeout(typingSendTimerRef.current)
      typingSendTimerRef.current = null
    }
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current)
      typingStopTimerRef.current = null
    }
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false
      void chatClientRef.current?.sendTyping(false)
    }
  }, [])

  const scheduleTypingSignal = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current)
    }
    typingStopTimerRef.current = setTimeout(() => {
      stopTypingSignal()
    }, TYPING_STOP_MS)

    if (isTypingActiveRef.current) return

    if (typingSendTimerRef.current) {
      clearTimeout(typingSendTimerRef.current)
    }
    typingSendTimerRef.current = setTimeout(() => {
      isTypingActiveRef.current = true
      void chatClientRef.current?.sendTyping(true)
    }, TYPING_SEND_DEBOUNCE_MS)
  }, [stopTypingSignal])

  const loadGroupContext = useCallback(async () => {
    setLoading(true)
    try {
      const [me, groupList] = await Promise.all([
        apiJson<UserProfileDto>('/me'),
        apiJson<GroupDto[]>('/groups'),
      ])
      setMeSub(me.sub)
      setMeDisplayName(me.display_name)
      setGroups(groupList)
      const gid = resolveActiveGroupId(groupList)
      setGroupId(gid)

      if (!gid) {
        setGroupName(null)
        setMembers([])
        setMessages([])
        return
      }

      const [detail, history] = await Promise.all([
        apiJson<GroupDetailDto>(`/groups/${gid}`),
        apiJson<ChatMessageDto[]>(`/groups/${gid}/chat/messages`),
      ])
      setGroupName(detail.name)
      setMembers(detail.members)
      setMessages(history)
    } catch (e) {
      toastUserError(e, "Couldn't load group chat. Try again.")
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGroupContext()
  }, [loadGroupContext])

  useEffect(() => {
    if (location.pathname === '/ai' || location.pathname === '/concierge') {
      void loadGroupContext()
    }
  }, [location.pathname, loadGroupContext])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_GROUP_STORAGE_KEY) {
        void loadGroupContext()
      }
    }
    const onFocus = () => void loadGroupContext()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadGroupContext])

  useEffect(() => {
    const client = new GroupChatClient()
    chatClientRef.current = client
    return () => {
      stopTypingSignal()
      client.disconnect()
      chatClientRef.current = null
    }
  }, [stopTypingSignal])

  useEffect(() => {
    if (!groupId || !meSub) return

    const client = chatClientRef.current
    if (!client) return

    let cancelled = false

    void client
      .connect(groupId, {
        onMessage: (msg) => {
          if (!cancelled) upsertMessage(msg)
        },
        onAiToken: (streamId, chunk) => {
          if (!cancelled) appendAiToken(streamId, chunk)
        },
        onAiStreamEnd: (streamId, msg) => {
          if (!cancelled) {
            clearAiStream(streamId)
            upsertMessage(msg)
          }
        },
        onTyping: (userSub, active) => {
          if (cancelled || userSub === meSub) return
          setTypingAt((prev) => {
            if (!active) {
              if (!(userSub in prev)) return prev
              const next = { ...prev }
              delete next[userSub]
              return next
            }
            return { ...prev, [userSub]: Date.now() }
          })
        },
        onError: (detail) => {
          if (cancelled) return
          // Ignore stale server responses when typing events are unsupported
          if (detail.includes("message type")) return
          toast.error(formatChatError(detail))
        },
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Can't connect to group chat right now. Try again in a moment.")
        }
      })

    return () => {
      cancelled = true
      client.disconnect()
    }
  }, [groupId, meSub, upsertMessage, appendAiToken, clearAiStream])

  const syncInputCursor = () => {
    const el = inputRef.current
    if (el) setCursorPos(el.selectionStart ?? el.value.length)
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    setMentionIndex(0)
    scheduleTypingSignal()
    requestAnimationFrame(syncInputCursor)
  }

  const pickMention = (option: MentionOption) => {
    if (!activeMention) return
    const { nextValue, nextCursor } = applyMention(
      inputValue,
      activeMention.start,
      cursorPos,
      option.insert,
    )
    setInputValue(nextValue)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(nextCursor, nextCursor)
      setCursorPos(nextCursor)
    })
  }

  const handleSend = async (text: string) => {
    if (!text.trim() || sending || !groupId) return

    stopTypingSignal()
    setSending(true)
    setInputValue('')
    setMentionIndex(0)

    try {
      await chatClientRef.current?.sendMessage(text)
    } catch (e) {
      toastUserError(e, "Couldn't send that message. Try again.")
      setInputValue(text)
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (showMentions && mentionSuggestions[mentionIndex]) {
      pickMention(mentionSuggestions[mentionIndex]!)
      return
    }
    void handleSend(inputValue)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showMentions) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIndex((i) => (i + 1) % mentionSuggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIndex(
        (i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length,
      )
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setMentionIndex(0)
    }
  }

  const displayMessages = (): Array<
    ChatMessageDto | { streamId: string; content: string; is_ai: true }
  > => {
    const items: Array<
      ChatMessageDto | { streamId: string; content: string; is_ai: true }
    > = [...messages]
    for (const [streamId, content] of Object.entries(streaming)) {
      if (content) {
        items.push({ streamId, content, is_ai: true })
      }
    }
    return items
  }

  if (loading) {
    return <PageLoader label="Loading chat…" className="min-h-[calc(100vh-8rem)]" />
  }

  if (!groupId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4 text-center px-6">
        <Users className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Join or create a group to start chatting with your crew.
        </p>
        <Button asChild variant="secondary">
          <Link to="/groups">Go to Groups</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-5rem)] min-h-0 overflow-hidden">
      <header className="shrink-0 pb-3 border-b border-border">
        <p className="text-xs text-muted-foreground">Group chat</p>
        <h1 className="text-lg font-semibold truncate">{groupName ?? 'Your group'}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tag <span className="font-medium text-foreground">@huddle</span> to ask the AI
        </p>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar">
        <div className="py-4 px-1 space-y-4">
          {displayMessages().length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Say hi to {groupName ?? 'your group'}. Mention @huddle when you want AI help.
            </p>
          )}

          {displayMessages().map((item) => {
            if ('streamId' in item) {
              return (
                <ChatBubble
                  key={item.streamId}
                  isOwn={false}
                  isAi
                  displayName="Huddle AI"
                  content={item.content}
                  timestamp={null}
                  senderSub=""
                />
              )
            }

            const isOwn = item.sender_sub === meSub
            const displayName = resolveSenderDisplayName(
              item.sender_sub,
              item.sender_display_name,
              item.is_ai,
            )
            return (
              <ChatBubble
                key={item.id}
                isOwn={isOwn}
                isAi={item.is_ai}
                displayName={displayName}
                content={item.content}
                timestamp={item.created_at}
                senderSub={item.sender_sub}
              />
            )
          })}

          {typingLabel && (
            <p className="text-xs text-muted-foreground px-2 animate-pulse">
              {typingLabel}
            </p>
          )}

          <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm py-3">
        <form onSubmit={handleSubmit} className="relative">
          {showMentions && (
            <ul
              className="absolute bottom-full left-0 right-0 mb-2 max-h-48 overflow-y-auto no-scrollbar rounded-xl border border-border bg-popover shadow-lg z-20 py-1"
              role="listbox"
            >
              {mentionSuggestions.map((opt, i) => (
                <li key={opt.id} role="option" aria-selected={i === mentionIndex}>
                  <button
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                      i === mentionIndex && 'bg-accent',
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickMention(opt)
                    }}
                  >
                    {opt.kind === 'ai' ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {initialsFromName(opt.label, opt.id)}
                      </span>
                    )}
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-muted-foreground text-xs ml-auto">
                      @{opt.insert}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onKeyUp={syncInputCursor}
                onClick={syncInputCursor}
                onBlur={stopTypingSignal}
                placeholder="Message your group… @huddle for AI"
                className="pr-12 h-12 rounded-xl bg-background"
                disabled={sending}
                autoComplete="off"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim() || sending}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </form>
        {groups.length > 1 && (
          <p className="text-[11px] text-muted-foreground mt-2 px-0.5">
            Active group from Pulse. Switch on{' '}
            <Link to="/groups" className="underline underline-offset-2">
              Groups
            </Link>
            .
          </p>
        )}
      </footer>
    </div>
  )
}

function ChatBubble({
  isOwn,
  isAi,
  displayName,
  content,
  timestamp,
  senderSub,
}: {
  isOwn: boolean
  isAi: boolean
  displayName: string
  content: string
  timestamp: string | null
  senderSub: string
}) {
  return (
    <div className={cn('flex gap-3', isOwn && 'flex-row-reverse')}>
      <Avatar
        className={cn(
          'w-8 h-8 shrink-0',
          isAi && 'bg-gradient-to-br from-primary to-accent',
        )}
      >
        <AvatarFallback
          className={cn(
            'text-xs',
            isAi && 'bg-transparent text-primary-foreground',
          )}
        >
          {isAi ? (
            <Sparkles className="w-4 h-4" />
          ) : (
            initialsFromName(displayName, senderSub)
          )}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'flex-1 max-w-[80%]',
          isOwn && 'flex flex-col items-end',
        )}
      >
        <span
          className={cn(
            'text-[11px] font-medium text-muted-foreground mb-1 px-1',
            isOwn && 'text-right',
          )}
        >
          {displayName}
        </span>
        <div
          className={cn(
            'rounded-2xl px-4 py-3',
            isAi || !isOwn
              ? 'bg-card border border-border rounded-tl-sm'
              : 'bg-primary text-primary-foreground rounded-tr-sm',
          )}
        >
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
        {timestamp && (
          <span className="text-[11px] text-muted-foreground mt-1 px-1">
            {formatTime(timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}
