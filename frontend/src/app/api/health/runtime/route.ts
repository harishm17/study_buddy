import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

type CheckStatus = 'pass' | 'warn' | 'fail'

type RuntimeCheck = {
  name: string
  status: CheckStatus
  message: string
}

function statusFromChecks(checks: RuntimeCheck[]): 'healthy' | 'degraded' | 'unhealthy' {
  if (checks.some((check) => check.status === 'fail')) return 'unhealthy'
  if (checks.some((check) => check.status === 'warn')) return 'degraded'
  return 'healthy'
}

function canWriteDir(baseDir: string): boolean {
  try {
    fs.mkdirSync(baseDir, { recursive: true })
    const marker = path.join(baseDir, '.healthcheck')
    fs.writeFileSync(marker, 'ok')
    fs.unlinkSync(marker)
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const checks: RuntimeCheck[] = []

  const nodeEnv = process.env.NODE_ENV || 'development'
  const appEnv = process.env.ENVIRONMENT || 'development'
  const isDeploymentProduction = appEnv === 'production'
  const aiServiceUrl = process.env.AI_SERVICE_URL || ''
  const cloudStorageEnabled = process.env.ENABLE_GCS_STORAGE === 'true'
  const cloudTasksEnabled = process.env.ENABLE_CLOUD_TASKS === 'true'
  const gcsProjectId = process.env.GCS_PROJECT_ID || ''
  const gcsBucket = process.env.GCS_BUCKET || ''
  const cloudTasksQueue = process.env.CLOUD_TASKS_QUEUE || ''
  const cloudTasksLocation = process.env.CLOUD_TASKS_LOCATION || ''
  const nextAuthSecret = process.env.NEXTAUTH_SECRET || ''
  const localUploadsDir = process.env.LOCAL_UPLOADS_DIR || '/data/uploads'

  if (!aiServiceUrl) {
    checks.push({
      name: 'ai_service_url',
      status: 'fail',
      message: 'AI_SERVICE_URL is not configured.',
    })
  } else {
    checks.push({
      name: 'ai_service_url',
      status: 'pass',
      message: `AI service URL configured (${aiServiceUrl}).`,
    })

    try {
      const response = await fetch(`${aiServiceUrl}/health`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!response.ok) {
        checks.push({
          name: 'ai_service_health',
          status: 'warn',
          message: `AI health endpoint returned ${response.status}.`,
        })
      } else {
        checks.push({
          name: 'ai_service_health',
          status: 'pass',
          message: 'AI service health endpoint reachable.',
        })
      }
    } catch (error) {
      checks.push({
        name: 'ai_service_health',
        status: 'fail',
        message: `AI service health check failed: ${String(error)}`,
      })
    }
  }

  if (cloudStorageEnabled) {
    if (gcsProjectId && gcsBucket) {
      checks.push({
        name: 'gcs_config',
        status: 'pass',
        message: 'GCS storage is enabled and configuration is present.',
      })
    } else {
      checks.push({
        name: 'gcs_config',
        status: 'fail',
        message: 'ENABLE_GCS_STORAGE=true requires both GCS_PROJECT_ID and GCS_BUCKET.',
      })
    }
  } else {
    const primaryWritable = canWriteDir(localUploadsDir)
    const fallbackWritable = canWriteDir('/tmp/studybuddy-uploads')
    if (primaryWritable || fallbackWritable) {
      checks.push({
        name: 'local_storage_writable',
        status: 'pass',
        message: `Local storage writable (${primaryWritable ? localUploadsDir : '/tmp/studybuddy-uploads'}).`,
      })
    } else {
      checks.push({
        name: 'local_storage_writable',
        status: 'fail',
        message: `Local storage is not writable in ${localUploadsDir} or /tmp/studybuddy-uploads.`,
      })
    }
  }

  if (cloudTasksEnabled) {
    if (gcsProjectId && cloudTasksQueue && cloudTasksLocation) {
      checks.push({
        name: 'cloud_tasks_config',
        status: 'pass',
        message: 'Cloud Tasks is enabled and configuration is present.',
      })
    } else {
      checks.push({
        name: 'cloud_tasks_config',
        status: 'fail',
        message: 'ENABLE_CLOUD_TASKS=true requires GCS_PROJECT_ID, CLOUD_TASKS_QUEUE, and CLOUD_TASKS_LOCATION.',
      })
    }
  } else {
    checks.push({
      name: 'cloud_tasks_config',
      status: 'warn',
      message: 'Cloud Tasks is disabled; background jobs run via direct HTTP mode.',
    })
  }

  if (isDeploymentProduction) {
    if (!nextAuthSecret || nextAuthSecret === 'dev-secret-change-in-production') {
      checks.push({
        name: 'nextauth_secret',
        status: 'fail',
        message: 'NEXTAUTH_SECRET must be set to a secure value in production.',
      })
    } else {
      checks.push({
        name: 'nextauth_secret',
        status: 'pass',
        message: 'NEXTAUTH_SECRET is configured.',
      })
    }
  } else if (!nextAuthSecret || nextAuthSecret === 'dev-secret-change-in-production') {
    checks.push({
      name: 'nextauth_secret',
      status: 'warn',
      message: 'NEXTAUTH_SECRET is using a local/dev value. Set a strong secret before deployment.',
    })
  }

  const status = statusFromChecks(checks)
  return NextResponse.json({
    status,
    environment: nodeEnv,
    appEnvironment: appEnv,
    checks,
    generatedAt: new Date().toISOString(),
  })
}
