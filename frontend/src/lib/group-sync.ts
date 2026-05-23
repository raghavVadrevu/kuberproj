import { fetchAuthSession } from 'aws-amplify/auth'

import { getApiBase } from '@/lib/api'

export type GroupSyncIncoming =
  | { type: 'activity'; area: string }
  | { type: 'pong' }
  | { type: 'error'; detail: string }

export type GroupSyncHandlers = {
  onActivity: (area: string) => void
}

function groupSyncWebSocketUrl(groupId: string, idToken: string): string {
  const base = getApiBase()
  const params = new URLSearchParams({ token: idToken })
  const pathSuffix = `/ws/groups/${groupId}/sync`

  if (base.startsWith('http://') || base.startsWith('https://')) {
    const url = new URL(base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `${url.pathname.replace(/\/$/, '')}${pathSuffix}`
    url.search = params.toString()
    return url.toString()
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const path = base.startsWith('/') ? `${base}${pathSuffix}` : `/${base}${pathSuffix}`
  return `${wsProtocol}//${window.location.host}${path}?${params.toString()}`
}

export class GroupSyncClient {
  private ws: WebSocket | null = null
  private connectPromise: Promise<WebSocket> | null = null
  private handlers: GroupSyncHandlers | null = null
  private groupId: string | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null

  async connect(groupId: string, handlers: GroupSyncHandlers): Promise<void> {
    if (this.groupId !== groupId) {
      this.disconnect()
      this.groupId = groupId
    }
    this.handlers = handlers
    await this.ensureSocket(groupId)
    this.startPing()
  }

  disconnect(): void {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectPromise = null
    this.handlers = null
    this.groupId = null
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 45_000)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
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

    const url = groupSyncWebSocketUrl(groupId, token)

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws
      this.groupId = groupId

      ws.onopen = () => resolve(ws)

      ws.onmessage = (event) => {
        let msg: GroupSyncIncoming
        try {
          msg = JSON.parse(event.data as string) as GroupSyncIncoming
        } catch {
          return
        }
        if (msg.type === 'activity') {
          this.handlers?.onActivity(msg.area)
        }
      }

      ws.onerror = () => {
        reject(new Error('Group sync WebSocket failed'))
      }

      ws.onclose = () => {
        this.ws = null
      }
    })
  }
}
