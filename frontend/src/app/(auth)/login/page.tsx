import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth/auth-config'
import { GOOGLE_SIGN_IN_ERRORS } from '@/lib/auth/google-link'
import { safeNextPath } from '@/lib/safe-redirect'
import { LoginForm } from '@/features/auth/login-form'
import { getSessionUser } from '@/server/session'

export const metadata: Metadata = {
  title: 'Sign in',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
}

type SearchParams = Promise<{ next?: string; error?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams
  const target = safeNextPath(next)
  if (await getSessionUser()) redirect(target)

  const googleEnabled = authOptions.providers.some((provider) => provider.id === 'google')
  const initialError = error
    ? (GOOGLE_SIGN_IN_ERRORS[error] ?? 'Something went wrong signing in. Try again.')
    : null

  return <LoginForm googleEnabled={googleEnabled} next={target} initialError={initialError} />
}
