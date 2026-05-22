import { fetchAuthSession } from 'aws-amplify/auth'

import type { ChatMessageDto } from '@/lib/api'

export type GroupChatWsIncoming =
  | { type: 'message'; message: ChatMessageDto }
  | { type: 'ai_token'; stream_id: string; content: string }
  | { type: 'ai_stream_end'; stream_id: string; message: ChatMessageDto }
  | { type: 'typing'; user_sub: string; active: boolean }
  | { type: 'error'; detail: string }

export type GroupChatHandlers = {
  onMessage: (message: ChatMessageDto) => void
  onAiToken: (streamId: string, chunk: string) => void
  onAiStreamEnd: (streamId: string, message: ChatMessageDto) => void
  onTyping: (userSub: string, active: boolean) => void
  onError: (detail: string) => void
}

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE as string | undefined
  const trimmed = raw?.trim()
  if (!trimmed) return '/api'
  return trimmed.replace(/\/$/, '')
}

export function groupChatWebSocketUrl(groupId: string, idToken: string): string {
  const base = apiBase()
  const params = new URLSearchParams({ token: idToken })
  const pathSuffix = `/ws/groups/${groupId}/chat`

  if (base.startsWith('http://') || base.startsWith('https://')) {
    const url = new URL(base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `${url.pathname.replace(/\/$/, '')}${pathSuffix}`
    url.search = params.toString()
    return url.toString()
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const path = base.startsWith('/')
    ? `${base}${pathSuffix}`
    : `/${base}${pathSuffix}`
  return `${wsProtocol}//${window.location.host}${path}?${params.toString()}`
}

export class GroupChatClient {
  private ws: WebSocket | null = null
  private connectPromise: Promise<WebSocket> | null = null
  private handlers: GroupChatHandlers | null = null
  private groupId: string | null = null

  async connect(groupId: string, handlers: GroupChatHandlers): Promise<void> {
    if (this.groupId !== groupId) {
      this.disconnect()
      this.groupId = groupId
    }
    this.handlers = handlers
    await this.ensureSocket(groupId)
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectPromise = null
    this.handlers = null
    this.groupId = null
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.groupId) {
      throw new Error('Not connected to a group')
    }
    const socket = await this.ensureSocket(this.groupId)
    socket.send(JSON.stringify({ type: 'message', content }))
  }

  async sendTyping(active: boolean): Promise<void> {
    if (!this.groupId || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    this.ws.send(JSON.stringify({ type: 'typing', active }))
  }

  private async ensureSocket(groupId: string): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN && this.groupId === groupId) {
      return this.ws
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.openSocket(groupId)
    try {
      return await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async openSocket(groupId: string): Promise<WebSocket> {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) {
      throw new Error('Not signed in')
    }

    const url = groupChatWebSocketUrl(groupId, token)

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws
      this.groupId = groupId

      ws.onopen = () => resolve(ws)

      ws.onmessage = (event) => {
        let msg: GroupChatWsIncoming
        try {
          msg = JSON.parse(event.data as string) as GroupChatWsIncoming
        } catch {
          this.handlers?.onError('Invalid server message')
          return
        }

        if (msg.type === 'message') {
          this.handlers?.onMessage(msg.message)
        } else if (msg.type === 'ai_token') {
          this.handlers?.onAiToken(msg.stream_id, msg.content)
        } else if (msg.type === 'ai_stream_end') {
          this.handlers?.onAiStreamEnd(msg.stream_id, msg.message)
        } else if (msg.type === 'typing') {
          this.handlers?.onTyping(msg.user_sub, msg.active)
        } else if (msg.type === 'error') {
          this.handlers?.onError(msg.detail)
        }
      }

      ws.onerror = () => {
        reject(new Error('WebSocket connection failed'))
      }

      ws.onclose = () => {
        this.ws = null
      }
    })
  }
}
