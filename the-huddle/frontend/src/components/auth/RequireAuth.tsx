import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchAuthSession } from 'aws-amplify/auth'

import { Spinner } from '@/components/ui/spinner'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [ready, setReady] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const session = await fetchAuthSession()
        if (session.tokens?.idToken) {
          if (!cancelled) {
            setOk(true)
            setReady(true)
          }
          return
        }
      } catch {
        /* not signed in */
      }
      if (!cancelled) {
        setOk(false)
        setReady(true)
        navigate('/login', { replace: true, state: { from: location.pathname } })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, location.pathname])

  if (!ready || !ok) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }

  return <>{children}</>
}
