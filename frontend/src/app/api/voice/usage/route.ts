import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/get-session'
import { getVoiceUsage } from '@/lib/voice/usage-query'
import { apiInternal, apiUnauthorized, isUnauthorizedError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    const usage = await getVoiceUsage(auth.user.id)
    return NextResponse.json(usage)
  } catch (error) {
    console.error('Voice usage error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    return apiInternal('Failed to load voice usage')
  }
}
