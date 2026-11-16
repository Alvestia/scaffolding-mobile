import { useCallback, useEffect, useRef, useState } from 'react'
import { captureScaffoldLocation } from '@/services/scaffold-location.service'
import { assertOfflineOwnerContext, captureOfflineOwnerContext } from '@/security/offline-owner'
import { useAuthStore } from '@/store/auth-store'
import type { ScaffoldGeolocation, ScaffoldLocationFields } from '@/types/scaffold-geolocation'

export function useScaffoldGeolocation(scope: string, known?: ScaffoldLocationFields | null) {
  const user = useAuthStore((state) => state.user)
  const identity = `${user?.tenantId}:${user?.id}:${scope}`
  const identityRef = useRef(identity)
  identityRef.current = identity
  const generation = useRef(0)
  const mounted = useRef(true)
  const [state, setState] = useState<{
    identity: string
    value?: ScaffoldGeolocation
    busy: boolean
    error?: string
  }>({ identity, busy: false })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const reset = useCallback(() => {
    generation.current++
    setState({ identity: identityRef.current, busy: false })
  }, [])
  useEffect(reset, [identity, reset])
  const setDraft = useCallback((value?: ScaffoldGeolocation) => {
    generation.current++
    setState({ identity: identityRef.current, value, busy: false })
  }, [])
  const capture = async () => {
    const request = ++generation.current
    const capturedIdentity = identity
    setState({ identity, busy: true })
    try {
      const owner = captureOfflineOwnerContext()
      const value = await captureScaffoldLocation()
      assertOfflineOwnerContext(owner)
      if (
        mounted.current &&
        request === generation.current &&
        capturedIdentity === identityRef.current
      )
        setState({ identity, value, busy: false })
    } catch (error) {
      if (
        mounted.current &&
        request === generation.current &&
        capturedIdentity === identityRef.current
      )
        setState({
          identity,
          busy: false,
          error: error instanceof Error ? error.message : 'Não foi possível capturar a posição.',
        })
    }
  }
  const hasLocation = known?.latitude != null && known?.longitude != null
  return {
    value: state.identity === identity && !hasLocation ? state.value : undefined,
    busy: state.identity === identity && state.busy,
    error: state.identity === identity ? state.error : undefined,
    hasLocation,
    capture,
    reset,
    setDraft,
  }
}
