'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, Check, X, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
  const [editingTopic, setEditingTopic] = useState<string | null>(null)

  useEffect(() => {
    fetchTopics()
  }, [projectId])

  const fetchTopics = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/topics`)
      if (!response.ok) throw new Error('Failed to fetch topics')

      const data = await response.json()
      setTopics(data.topics)
    } catch (error) {
      console.error('Error fetching topics:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExtractTopics = async () => {
    try {
      setExtracting(true)

      const response = await fetch(`/api/projects/${projectId}/extract-topics`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to extract topics')
      }

      const data = await response.json()
      const jobId = data.jobId

      // Poll for job completion
      await pollJobStatus(jobId)

      // Refresh topics list
      await fetchTopics()
    } catch (error) {
      console.error('Error extracting topics:', error)
      alert(error instanceof Error ? error.message : 'Failed to extract topics')
    } finally {
      setExtracting(false)
    }
  }

  const pollJobStatus = async (jobId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const response = await fetch(`/api/jobs/${jobId}`)
          if (!response.ok) throw new Error('Failed to fetch job status')

          const job = await response.json()

          if (job.status === 'completed') {
            resolve()
            return
          }

          if (job.status === 'failed') {
            reject(new Error(job.errorMessage || 'Topic extraction failed'))
            return
          }

          // Continue polling
          setTimeout(poll, 2000)
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
  }

  const handleAddTopic = async () => {
    if (!newTopicName.trim()) return

    try {
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
      alert('Failed to add topic')
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Are you sure you want to delete this topic?')) return

    try {
      const response = await fetch(`/api/topics/${topicId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete topic')

      setTopics(topics.filter(t => t.id !== topicId))
    } catch (error) {
      console.error('Error deleting topic:', error)
      alert('Failed to delete topic')
    }
  }

  const handleConfirmTopics = async () => {
    try {
      setSaving(true)

      // Confirm all topics
      await Promise.all(
        topics.map(topic =>
          fetch(`/api/topics/${topic.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userConfirmed: true }),
          })
        )
      )

      // Update project status
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })

      // Optionally navigate back to project page after confirmation
      router.push(`/projects/${projectId}`)
    } catch (error) {
      console.error('Error confirming topics:', error)
      alert('Failed to confirm topics')
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
      <Card>
        <CardHeader>
          <CardTitle>Topic Extraction</CardTitle>
          <CardDescription>
            AI will analyze your materials and identify key topics to study
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                  className="border rounded-lg p-4 hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {index + 1}
                        </Badge>
                        <h4 className="font-semibold">{topic.name}</h4>
                        {topic.userConfirmed && (
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
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

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTopic(topic.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Add Topic */}
              <div className="border-2 border-dashed rounded-lg p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add custom topic..."
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                    className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
