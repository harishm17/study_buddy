'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ListChecks } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type NextAction = {
  id: string
  type:
    | 'upload_materials'
    | 'extract_topics'
    | 'confirm_topics'
    | 'study_topic'
    | 'review_topic'
    | 'take_quiz'
    | 'voice_drill'
    | 'generate_content'
    | 'take_exam'
  topicId: string | null
  title: string
  reason: string
  priority: number
  etaMinutes: number
}

type NextActionsCardProps = {
  projectId: string
  topicId?: string
  hideRedundant?: boolean
  compact?: boolean
  maxActions?: number
  autoStartBatchGeneration?: boolean
}

const isBatchGenerateAction = (action: NextAction): boolean => {
  return action.type === 'generate_content' && action.id.includes('-batch')
}

const getActionHref = (projectId: string, action: NextAction): string => {
  if (isBatchGenerateAction(action)) {
    return `/projects/${projectId}?tab=topics`
  }
  if (action.type === 'upload_materials') {
    return `/projects/${projectId}/upload`
  }
  if (action.type === 'extract_topics') {
    return `/projects/${projectId}/topics/review`
  }
  if (action.type === 'confirm_topics') {
    return `/projects/${projectId}?tab=topics`
  }
  if (action.topicId) {
    if (action.type === 'generate_content') {
      return `/projects/${projectId}/topics/${action.topicId}?tab=generate`
    }
    return `/projects/${projectId}/topics/${action.topicId}`
  }
  if (action.type === 'take_exam') {
    return `/projects/${projectId}/generate-exam`
  }
  // Keep users in flow even if a new action type is introduced.
  return `/projects/${projectId}?tab=topics`
}

export function NextActionsCard({
  projectId,
  topicId,
  hideRedundant = false,
  compact = false,
  maxActions,
  autoStartBatchGeneration = false,
}: NextActionsCardProps) {
  const [actions, setActions] = useState<NextAction[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [batchStarting, setBatchStarting] = useState(false)
  const actionsFingerprintRef = useRef<string>('')
  const autoStartedRef = useRef<Set<string>>(new Set())

  const fetchActions = useCallback(async (background = false) => {
    if (!background) {
      setInitialLoading(true)
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/next-actions`, { cache: 'no-store' })
      if (!response.ok) {
        if (!background) {
          setActions([])
        }
        return
      }
      const payload = await response.json()
      const nextActions = Array.isArray(payload.actions) ? payload.actions : []
      const nextFingerprint = JSON.stringify(nextActions)
      if (nextFingerprint !== actionsFingerprintRef.current) {
        actionsFingerprintRef.current = nextFingerprint
        setActions(nextActions)
      }
    } catch {
      if (!background) {
        setActions([])
      }
    } finally {
      setInitialLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    let mounted = true
    void fetchActions(false)

    const onFocus = () => {
      if (!mounted) return
      void fetchActions(true)
    }
    window.addEventListener('focus', onFocus)

    return () => {
      mounted = false
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchActions])

  const filteredActions = useMemo(() => {
    if (!hideRedundant || !topicId) return actions
    return actions.filter((action) => !action.topicId)
  }, [actions, hideRedundant, topicId])

  const resolvedMaxActions = useMemo(() => {
    if (typeof maxActions === 'number' && maxActions > 0) return maxActions
    return compact ? 4 : 3
  }, [compact, maxActions])

  const visibleActions = useMemo(() => {
    if (!topicId) return filteredActions.slice(0, resolvedMaxActions)
    const topicScoped = filteredActions.filter((action) => action.topicId === topicId)
    const fallback = filteredActions.filter((action) => !action.topicId)
    return [...topicScoped, ...fallback].slice(0, resolvedMaxActions)
  }, [filteredActions, resolvedMaxActions, topicId])

  const renderActionMeta = useCallback((action: NextAction) => {
    if (action.type === 'generate_content') return `Generate · ~${action.etaMinutes} min`
    if (action.type === 'study_topic') return `Study · ~${action.etaMinutes} min`
    if (action.type === 'review_topic') return `Review · ~${action.etaMinutes} min`
    if (action.type === 'take_quiz') return `Quiz · ~${action.etaMinutes} min`
    if (action.type === 'voice_drill') return `Voice Coach · ~${action.etaMinutes} min`
    if (action.type === 'take_exam') return `Exam · ~${action.etaMinutes} min`
    if (action.type === 'extract_topics' || action.type === 'confirm_topics') return `Topics · ~${action.etaMinutes} min`
    return `Upload · ~${action.etaMinutes} min`
  }, [])

  const startBatchGeneration = useCallback(async () => {
    if (batchStarting) return
    setBatchStarting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/generate-missing-content`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('Failed to start background generation')
      }
      await fetchActions(true)
    } catch (error) {
      console.error('Batch generation error:', error)
    } finally {
      setBatchStarting(false)
    }
  }, [batchStarting, fetchActions, projectId])

  const primaryAction = visibleActions[0]
  const secondaryActions = visibleActions.slice(1)
  const primaryIsBatchGeneration = !!primaryAction && isBatchGenerateAction(primaryAction)
  const primaryIsActiveBatch = !!primaryAction && primaryAction.id.endsWith('-batch-active')

  useEffect(() => {
    if (!compact || !autoStartBatchGeneration || initialLoading || !primaryAction) return
    if (!isBatchGenerateAction(primaryAction)) return
    if (primaryIsActiveBatch) return
    if (autoStartedRef.current.has(primaryAction.id)) return
    autoStartedRef.current.add(primaryAction.id)
    void startBatchGeneration()
  }, [
    autoStartBatchGeneration,
    compact,
    initialLoading,
    primaryAction,
    primaryIsActiveBatch,
    startBatchGeneration,
  ])

  if (!initialLoading && hideRedundant && visibleActions.length === 0) {
    return null
  }

  if (compact) {
    return (
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/[0.07] via-white/80 to-white/80">
        <CardContent className="space-y-3 px-4 py-4 md:px-5">
          {initialLoading && (
            <div className="rounded-xl border border-border/60 bg-white/60 p-4">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted/80" />
            </div>
          )}
          {!initialLoading && !primaryAction && (
            <div className="text-sm text-muted-foreground">You are all caught up for now.</div>
          )}
          {!initialLoading && primaryAction && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Recommended next step
                  </div>
                  <div className="text-base font-semibold leading-tight">{primaryAction.title}</div>
                  <div className="text-sm text-muted-foreground">{primaryAction.reason}</div>
                  <div className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {renderActionMeta(primaryAction)}
                  </div>
                </div>
                {primaryIsBatchGeneration && !primaryIsActiveBatch ? (
                  <Button size="sm" onClick={startBatchGeneration} disabled={batchStarting}>
                    {batchStarting ? 'Starting...' : 'Start in Background'}
                  </Button>
                ) : (
                  <Button size="sm" asChild>
                    <Link href={getActionHref(projectId, primaryAction)}>
                      {primaryIsActiveBatch ? 'View Topics' : 'Open'}
                      <ArrowRight className="ml-2 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
              {secondaryActions.length > 0 && (
                <div className="rounded-lg border border-border/70 bg-white/65 px-3 py-2 text-xs text-muted-foreground">
                  {secondaryActions.length} more recommendation{secondaryActions.length === 1 ? '' : 's'} will appear after you complete this step.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Recommended Next Steps
        </CardTitle>
        <CardDescription>
          Focus on one step at a time, then continue with the next item.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {initialLoading && (
          <div className="rounded-xl border border-border/60 bg-white/50 p-4">
            <div className="h-5 w-52 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted/80" />
          </div>
        )}
        {!initialLoading && visibleActions.length === 0 && (
          <div className="text-sm text-muted-foreground">You are all caught up for now.</div>
        )}
        {visibleActions.map((action) => (
          <div key={action.id} className="rounded-xl border border-border/70 bg-white/70 px-4 py-3 transition hover:border-primary/30 hover:bg-white">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="font-medium">{action.title}</div>
                <div className="text-sm text-muted-foreground">{action.reason}</div>
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {renderActionMeta(action)}
                </div>
              </div>
              {isBatchGenerateAction(action) && !action.id.endsWith('-batch-active') ? (
                <Button size="sm" variant="outline" onClick={startBatchGeneration} disabled={batchStarting}>
                  {batchStarting ? 'Starting...' : 'Start in Background'}
                </Button>
              ) : (
                <Button size="sm" variant="outline" asChild>
                  <Link href={getActionHref(projectId, action)}>
                    {action.id.endsWith('-batch-active') ? 'View Topics' : 'Open'}
                    <ArrowRight className="ml-2 h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
