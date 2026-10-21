import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-config'
import { loginUrl } from '@/lib/safe-redirect'

export type SessionUser = { id: string; email: string; name: string | null }

/** The signed-in user, or null. One session lookup per request however many callers ask. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getServerSession(authOptions)
  const user = session?.user
  if (!user?.id) return null
  return { id: user.id, email: user.email ?? '', name: user.name ?? null }
})

/**
 * The signed-in user, or a redirect to /login?next=<the page they asked for>. The path comes
 * from the x-pathname header that src/proxy.ts sets.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (user) return user
  const path = (await headers()).get('x-pathname')
  redirect(loginUrl(path))
}
