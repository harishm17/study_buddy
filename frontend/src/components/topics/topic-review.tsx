'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, GitMerge, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useJobPolling } from '@/hooks/useJobPolling'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MergeTopicDialog } from '@/components/topics/merge-topic-dialog'

interface Topic {
  id: string
  name: string
  description: string | null
  keywords: string[]
  orderIndex: number
  userConfirmed: boolean
}

interface TopicReviewProps {
  projectId: string
}

export function TopicReview({ projectId }: TopicReviewProps) {
  const router = useRouter()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const { pollJob, stopPolling, resumeActiveJobs } = useJobPolling({ timeoutMs: 120_000 })

  const fetchTopics = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/topics`)
      if (!response.ok) throw new Error('Failed to fetch topics')

      const data = await response.json()
      setTopics(data.topics)
    } catch (error) {
      console.error('Error fetching topics:', error)
      setError('Unable to load topics.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchTopics()
  }, [fetchTopics])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  // An extraction already running (started before a refresh, or by the AI service after the
  // last upload was chunked): follow it instead of showing an empty list.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const active = await resumeActiveJobs({ projectId, jobTypes: ['extract_topics'] }).catch(() => [])
      if (cancelled || active.length === 0) return
      setExtracting(true)
      const pollResult = await pollJob(active[0].id)
      if (cancelled) return
      if (pollResult.state === 'completed') {
        await fetchTopics()
      } else {
        setError(pollResult.error || 'Topic extraction failed')
      }
      setExtracting(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchTopics, pollJob, projectId, resumeActiveJobs])

  const handleExtractTopics = async () => {
    try {
      setExtracting(true)
      setError(null)

      const response = await fetch(`/api/projects/${projectId}/extract-topics`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const message = typeof error?.error === 'string'
          ? error.error
          : error?.error?.message || 'Failed to extract topics'
        throw new Error(message)
      }

      const data = await response.json()
      const jobId = data.jobId

      // Poll for job completion
      const pollResult = await pollJob(jobId)
      if (pollResult.state !== 'completed') {
        throw new Error(pollResult.error || 'Topic extraction failed')
      }

      // Refresh topics list
      await fetchTopics()
    } catch (error) {
      console.error('Error extracting topics:', error)
      setError(error instanceof Error ? error.message : 'Failed to extract topics')
    } finally {
      setExtracting(false)
    }
  }

  const handleAddTopic = async () => {
    if (!newTopicName.trim()) return

    try {
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTopicName,
        }),
      })

      if (!response.ok) throw new Error('Failed to add topic')

      const data = await response.json()
      setTopics([...topics, data.topic])
      setNewTopicName('')
    } catch (error) {
      console.error('Error adding topic:', error)
      setError('Failed to add topic')
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    try {
      setError(null)
      const response = await fetch(`/api/topics/${topicId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete topic')

      setTopics(topics.filter(t => t.id !== topicId))
    } catch (error) {
      console.error('Error deleting topic:', error)
      setError('Failed to delete topic')
    }
  }

  const startRename = (topic: Topic) => {
    setEditingId(topic.id)
    setEditName(topic.name)
  }

  const handleRename = async (topicId: string) => {
    const name = editName.trim()
    if (!name) return
    setEditBusy(true)
    try {
      setError(null)
      const response = await fetch(`/api/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error('Failed to rename topic')
      setTopics((current) => current.map((t) => (t.id === topicId ? { ...t, name } : t)))
      setEditingId(null)
    } catch (error) {
      console.error('Error renaming topic:', error)
      setError('Failed to rename topic')
    } finally {
      setEditBusy(false)
    }
  }

  const handleMove = async (topicId: string, toIndex: number) => {
    setEditBusy(true)
    try {
      setError(null)
      const response = await fetch(`/api/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIndex: toIndex }),
      })
      if (!response.ok) throw new Error('Failed to reorder topic')
      await fetchTopics()
    } catch (error) {
      console.error('Error reordering topic:', error)
      setError('Failed to reorder topic')
    } finally {
      setEditBusy(false)
    }
  }

  const handleMerge = async (sourceTopicId: string, targetTopicId: string) => {
    try {
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/topics/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTopicId, targetTopicId }),
      })
      if (!response.ok) throw new Error('Failed to merge topics')
      await fetchTopics()
    } catch (error) {
      console.error('Error merging topics:', error)
      setError('Failed to merge topics')
    }
  }

  const handleConfirmTopics = async () => {
    try {
      setSaving(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/topics/confirm`, {
        method: 'POST',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error?.message || 'Failed to confirm topics')
      }

      router.push(`/projects/${projectId}?tab=topics`)
    } catch (error) {
      console.error('Error confirming topics:', error)
      setError('Failed to confirm topics')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Topic Extraction</CardTitle>
          <CardDescription>
            AI will analyze your materials and identify key topics to study
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {topics.length === 0 ? (
            <Button
              onClick={handleExtractTopics}
              disabled={extracting}
              size="lg"
              className="w-full"
            >
              {extracting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Extracting Topics...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Extract Topics from Materials
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {topics.length} topic{topics.length !== 1 ? 's' : ''} identified
              </p>
              <Button
                onClick={handleExtractTopics}
                variant="outline"
                disabled={extracting}
              >
                {extracting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Re-extracting...
                  </>
                ) : (
                  'Re-extract Topics'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Topics List */}
      {topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Review Topics</CardTitle>
            <CardDescription>
              Review, edit, or remove topics before proceeding
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topics.map((topic, index) => (
                <div
                  key={topic.id}
                  className="rounded-xl border border-border/70 bg-white/70 p-4 transition hover:border-primary/35 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {index + 1}
                        </Badge>
                        {editingId === topic.id ? (
                          <form
                            className="flex flex-1 items-center gap-2"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void handleRename(topic.id)
                            }}
                          >
                            <input
                              type="text"
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                              onKeyDown={(event) => event.key === 'Escape' && setEditingId(null)}
                              aria-label={`Topic name for topic ${index + 1}`}
                              maxLength={255}
                              autoFocus
                              className="flex-1 rounded-xl border border-input/80 bg-white/90 px-3 py-1.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                            <Button
                              type="submit"
                              size="icon"
                              variant="ghost"
                              disabled={editBusy || !editName.trim()}
                              aria-label="Save topic name"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancel renaming"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </form>
                        ) : (
                          <h4 className="font-semibold">{topic.name}</h4>
                        )}
                        {topic.userConfirmed && (
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Confirmed" />
                        )}
                      </div>

                      {topic.description && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {topic.description}
                        </p>
                      )}

                      {topic.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {topic.keywords.slice(0, 5).map((keyword, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                          {topic.keywords.length > 5 && (
                            <Badge variant="secondary" className="text-xs">
                              +{topic.keywords.length - 5} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMove(topic.id, index - 1)}
                        disabled={index === 0 || editBusy}
                        aria-label={`Move ${topic.name} up`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMove(topic.id, index + 1)}
                        disabled={index === topics.length - 1 || editBusy}
                        aria-label={`Move ${topic.name} down`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startRename(topic)}
                        disabled={editBusy}
                        aria-label={`Rename ${topic.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {topics.length > 1 && (
                        <MergeTopicDialog
                          source={{ id: topic.id, name: topic.name }}
                          candidates={topics.filter((t) => t.id !== topic.id)}
                          onMerge={(targetId) => handleMerge(topic.id, targetId)}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={editBusy}
                              aria-label={`Merge ${topic.name} into another topic`}
                            >
                              <GitMerge className="h-4 w-4" />
                            </Button>
                          }
                        />
                      )}
                      <ConfirmDialog
                        title="Delete topic?"
                        description={`"${topic.name}" and its generated content will be removed.`}
                        confirmLabel="Delete"
                        variant="destructive"
                        onConfirm={() => handleDeleteTopic(topic.id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Delete ${topic.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Topic */}
              <div className="rounded-xl border-2 border-dashed border-border/80 bg-white/60 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add custom topic..."
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                    className="flex-1 rounded-xl border border-input/80 bg-white/90 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <Button
                    onClick={handleAddTopic}
                    size="sm"
                    disabled={!newTopicName.trim()}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Button */}
      {topics.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleConfirmTopics}
            disabled={saving}
            size="lg"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" />
                Confirm Topics & Continue
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
