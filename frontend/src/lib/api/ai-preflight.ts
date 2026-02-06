import { NextResponse } from 'next/server'
import { ApiErrorCode, apiError } from '@/lib/api/errors'

type DependencyCheck = {
  name?: string
  status?: string
  message?: string
}

export async function ensureAiGenerationReady(): Promise<NextResponse | null> {
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000'

  try {
    const response = await fetch(`${aiServiceUrl}/health/dependencies`, {
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      return apiError(
        ApiErrorCode.UPSTREAM_ERROR,
        'AI service is unavailable. Please try again in a moment.',
        undefined,
        503
      )
    }

    const payload = await response.json()
    const checks = Array.isArray(payload?.checks) ? (payload.checks as DependencyCheck[]) : []

    const openAiCheck = checks.find((check) => check.name === 'openai_key')
    if (openAiCheck?.status === 'fail') {
      return apiError(
        ApiErrorCode.UPSTREAM_ERROR,
        'AI service is missing OPENAI_API_KEY. Configure it before generating content.',
        undefined,
        503
      )
    }

    const dbCheck = checks.find((check) => check.name === 'database')
    if (dbCheck?.status === 'fail') {
      return apiError(
        ApiErrorCode.UPSTREAM_ERROR,
        'AI service database dependency is unavailable.',
        undefined,
        503
      )
    }

    return null
  } catch {
    return apiError(
      ApiErrorCode.UPSTREAM_ERROR,
      'AI service health check failed. Please verify service availability.',
      undefined,
      503
    )
  }
}
