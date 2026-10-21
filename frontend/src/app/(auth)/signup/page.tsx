import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth/auth-config'
import { safeNextPath } from '@/lib/safe-redirect'
import { SignupForm } from '@/features/auth/signup-form'
import { getSessionUser } from '@/server/session'

export const metadata: Metadata = {
  title: 'Create your account',
  alternates: { canonical: '/signup' },
}

type SearchParams = Promise<{ next?: string }>

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams
  if (await getSessionUser()) redirect(safeNextPath(next))

  const googleEnabled = authOptions.providers.some((provider) => provider.id === 'google')
  return <SignupForm googleEnabled={googleEnabled} />
}
