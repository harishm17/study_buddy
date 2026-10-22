'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  deriveOrbState,
  initialSessionState,
  sessionReducer,
  summarize,
  type OrbState,
  type SessionState,
  type SessionSummary,
} from './session-state'
import {
  createVoiceController,
  type StartConfig,
  type VoiceController,
  type VoiceControllerOptions,
} from './voice-controller'

export type VoiceSession = {
  state: SessionState
  orb: OrbState
  summary: SessionSummary
  controller: VoiceController
}

export type { StartConfig }

/** One voice practice: the reducer state for the UI plus the controller that drives it. */
export function useVoiceSession(options: VoiceControllerOptions): VoiceSession {
  const [state, dispatch] = React.useReducer(sessionReducer, initialSessionState)
  const router = useRouter()
  const [controller] = React.useState<VoiceController>(() =>
    createVoiceController({ dispatch, options, onFinished: () => router.refresh() })
  )
  React.useEffect(() => {
    controller.setOptions(options)
  }, [controller, options])

  React.useEffect(() => {
    const onHide = () => controller.pageHide()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      controller.dispose()
    }
  }, [controller])

  const orb = deriveOrbState(state)
  const summary = React.useMemo(() => summarize(state), [state])
  return { state, orb, summary, controller }
}
