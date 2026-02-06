import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export enum ApiErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export type ApiErrorPayload = {
  error: {
    code: ApiErrorCode
    message: string
    details?: unknown
  }
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  status = 400
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    } satisfies ApiErrorPayload,
    { status }
  )
}

export function apiUnauthorized(message = 'Unauthorized') {
  return apiError(ApiErrorCode.UNAUTHORIZED, message, undefined, 401)
}

export function apiNotFound(message = 'Not found') {
  return apiError(ApiErrorCode.NOT_FOUND, message, undefined, 404)
}

export function apiInvalidInput(message = 'Invalid input', details?: unknown) {
  return apiError(ApiErrorCode.INVALID_INPUT, message, details, 400)
}

export function apiUpstream(message = 'Upstream request failed', details?: unknown) {
  return apiError(ApiErrorCode.UPSTREAM_ERROR, message, details, 502)
}

export function apiInternal(message = 'Internal server error', details?: unknown) {
  return apiError(ApiErrorCode.INTERNAL_ERROR, message, details, 500)
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof Error && error.message === 'Unauthorized'
}

export function zodDetails(error: unknown) {
  if (!(error instanceof ZodError)) return undefined
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}
