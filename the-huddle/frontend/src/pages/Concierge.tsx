import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, User, ArrowRight, MessageSquare, Vote, Wallet, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const suggestedPrompts = [
  { icon: MessageSquare, text: 'Summarize the cabin trip thread' },
  { icon: Vote, text: "Who hasn't voted yet?" },
  { icon: Wallet, text: "What's our remaining budget?" },
  { icon: Calendar, text: 'When is everyone free this weekend?' },
]

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'assistant',
    content: "Hey! I'm the Huddle AI Concierge. I can help you catch up on group activity, track expenses, check voting status, and more. What would you like to know?",
    timestamp: new Date(),
  },
]

export default function ConciergePage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    // Simulate AI response
    setTimeout(() => {
      const responses: Record<string, string> = {
        'summarize': "📍 **Cabin Trip Summary**\n\nThe July 4th Lake Tahoe trip is confirmed! Here's what you need to know:\n\n• **8 confirmed** attendees (Alex & Jordan still pending)\n• **Total budget**: $2,400 spent of $3,000\n• **Check-in**: July 3rd, 4PM\n• **Key decisions**: Groceries assigned to Emma, activities TBD\n\nWould you like me to ping Alex and Jordan for their RSVPs?",
        'voted': "📊 **Voting Status**\n\nFor the \"July Trip Destination\" poll:\n\n✅ **Voted (8)**: Alex, Sarah, Mike, Jordan, Chris, Emma, David, Kate\n❌ **Not Voted (2)**: Riley, Lisa\n\n⏰ Poll closes in 3 days. Want me to send a reminder to Riley and Lisa?",
        'budget': "💰 **Group Budget Status**\n\n**Total Pool**: $3,000\n**Spent**: $2,400 (80%)\n**Remaining**: $600\n\n**Breakdown**:\n• Lodging: $1,500\n• Food & Drinks: $650\n• Activities: $250\n\nAt current pace, you'll have about $150 buffer. Need me to flag any specific expenses?",
        'weekend': "📅 **Weekend Availability**\n\nBased on the heatmap data:\n\n**Best Time**: Saturday Evening (9/10 available)\n• Only Mike can't make it\n\n**Runner Up**: Sunday Afternoon (7/10 available)\n\nWant me to create a poll for Saturday evening activities?",
      }

      let responseText = "I'm analyzing the group's data now. Let me get that information for you..."
      
      const lowerText = text.toLowerCase()
      if (lowerText.includes('summarize') || lowerText.includes('cabin')) {
        responseText = responses['summarize']
      } else if (lowerText.includes('voted') || lowerText.includes('vote')) {
        responseText = responses['voted']
      } else if (lowerText.includes('budget') || lowerText.includes('money') || lowerText.includes('remaining')) {
        responseText = responses['budget']
      } else if (lowerText.includes('weekend') || lowerText.includes('free') || lowerText.includes('available')) {
        responseText = responses['weekend']
      }

      const aiMessage: Message = {
        id: Date.now(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMessage])
      setIsTyping(false)
    }, 1500)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSend(inputValue)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-5rem)]">
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="py-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' && 'flex-row-reverse'
              )}
            >
              <Avatar className={cn(
                'w-8 h-8 shrink-0',
                message.role === 'assistant' && 'bg-gradient-to-br from-primary to-accent'
              )}>
                <AvatarFallback className={cn(
                  'text-xs',
                  message.role === 'assistant' && 'bg-transparent text-primary-foreground'
                )}>
                  {message.role === 'assistant' ? (
                    <Sparkles className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className={cn(
                'flex-1 max-w-[80%]',
                message.role === 'user' && 'flex flex-col items-end'
              )}>
                <div className={cn(
                  'rounded-2xl px-4 py-3',
                  message.role === 'assistant' 
                    ? 'bg-card border border-border rounded-tl-sm' 
                    : 'bg-primary text-primary-foreground rounded-tr-sm'
                )}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 px-1">
                  {formatTime(message.timestamp)}
                </span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8 bg-gradient-to-br from-primary to-accent">
                <AvatarFallback className="bg-transparent text-primary-foreground">
                  <Sparkles className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggested Prompts */}
      {messages.length <= 2 && (
        <div className="pb-2">
            <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt.text)}
                  className="flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary rounded-full text-xs text-foreground transition-colors group"
                >
                  <prompt.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{prompt.text}</span>
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
        </div>
      )}

      {/* Input */}
      <div className="py-4 border-t border-border bg-card/50">
        <form onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask the Huddle AI anything..."
                className="pr-12 h-12 rounded-xl bg-background"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim() || isTyping}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
