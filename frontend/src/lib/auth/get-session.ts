/**
 * Server-side session utilities
 */

import { getServerSession } from 'next-auth'
import { authOptions } from './auth-config'

export interface UserSession {
  user: {
    id: string
    email: string
    name?: string | null
  }
}

/**
 * Get the current session, throw if not authenticated
 * Use this in API routes that require authentication
 */
export async function requireAuth(): Promise<UserSession> {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    throw new Error('Unauthorized')
  }

  return session as UserSession
}

/**
 * Get the current session, return null if not authenticated
 * Use this for optional authentication
 */
export async function getOptionalAuth(): Promise<UserSession | null> {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    return null
  }

  return session as UserSession
}
