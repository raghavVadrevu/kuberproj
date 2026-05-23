import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { WifiOff } from 'lucide-react'

import { getApiBase } from '@/lib/api'
import { cn } from '@/lib/utils'

type ConnectivityContextValue = {
  isOnline: boolean
  apiReachable: boolean
}

const ConnectivityContext = createContext<ConnectivityContextValue>({
  isOnline: true,
  apiReachable: true,
})

const TOAST_ID = 'huddle-connectivity'
const PING_INTERVAL_MS = 30_000
const PING_TIMEOUT_MS = 8_000

export function useConnectivity(): ConnectivityContextValue {
  return useContext(ConnectivityContext)
}

function OfflineBanner() {
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>You&apos;re offline. Changes won&apos;t sync until you&apos;re back online.</span>
    </div>
  )
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  )
  const [apiReachable, setApiReachable] = useState(true)
  const wasOfflineRef = useRef(!navigator.onLine)
  const apiDownToastShownRef = useRef(false)

  const pingApi = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false
    }
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
      const res = await fetch(`${getApiBase()}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      })
      window.clearTimeout(timer)
      return res.ok
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false
        toast.success("You're back online", { id: TOAST_ID })
      }
      void pingApi().then(setApiReachable)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setApiReachable(false)
      wasOfflineRef.current = true
      apiDownToastShownRef.current = false
      toast.error("You're offline. Check your connection.", {
        id: TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
      })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [pingApi])

  useEffect(() => {
    if (!isOnline) return

    let cancelled = false

    const runPing = async () => {
      const ok = await pingApi()
      if (cancelled) return

      setApiReachable(ok)

      if (!ok && isOnline) {
        if (!apiDownToastShownRef.current) {
          apiDownToastShownRef.current = true
          toast.error("Can't reach Huddle right now. We'll keep trying.", {
            id: 'huddle-api-down',
            duration: 10_000,
          })
        }
      } else if (ok && apiDownToastShownRef.current) {
        apiDownToastShownRef.current = false
        toast.success('Connected to Huddle again', { id: 'huddle-api-down' })
      }
    }

    void runPing()
    const id = window.setInterval(() => void runPing(), PING_INTERVAL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void runPing()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isOnline, pingApi])

  const showOfflineBanner = !isOnline

  return (
    <ConnectivityContext.Provider value={{ isOnline, apiReachable }}>
      {showOfflineBanner ? <OfflineBanner /> : null}
      <div className={cn(showOfflineBanner && 'opacity-95')}>{children}</div>
    </ConnectivityContext.Provider>
  )
}
