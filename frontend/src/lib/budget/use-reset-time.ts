'use client'

import * as React from 'react'
import { RESET_TOKEN, fillResetTime } from './copy'

const subscribe = () => () => {}

/**
 * A message that may carry RESET_TOKEN (text written on the server), with the reset time in the
 * student's time zone. The server render and hydration say "midnight UTC"; the local time follows.
 */
export function useResetTime(message: string): string {
  const hasToken = message.includes(RESET_TOKEN)
  const local = React.useSyncExternalStore(
    subscribe,
    () => (hasToken ? fillResetTime(message) : message),
    () => (hasToken ? message.replace(RESET_TOKEN, 'at midnight UTC') : message)
  )
  return local
}
