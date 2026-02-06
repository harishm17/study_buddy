'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, BookOpen, Code, HelpCircle, ClipboardList, CheckCircle, Circle, Mic, Sparkles, BarChart3, Layers3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { SectionNotesViewer } from './section-notes-viewer'
import { SolvedExamplesViewer } from './solved-examples-viewer'
import { InteractiveExamplesViewer } from './interactive-examples-viewer'
import { QuizInterface } from './quiz-interface'
import { VoiceCoach } from '@/components/voice/VoiceCoach'
import { ContentGenerator } from '@/components/content/content-generator'

type ContentType = 'notes' | 'solved_examples' | 'interactive_examples' | 'quiz' | 'voice_drill' | 'generate'

type TopicContentItem = {
  id: string
  contentType: string
  contentData: any
  metadata: any
  createdAt?: string | Date
}

interface Topic {
  id: string
  name: string
  description: string | null
  orderIndex: number
  project: {
    id: string
    name: string
  }
  content: TopicContentItem[]
  topicQuizzes: Array<{
    id: string
    questions: any
    createdAt: string | Date
  }>
  progress: Array<{
    notesCompleted: boolean
    examplesCompleted: boolean
    quizCompleted: boolean
    quizScore: number | null
  }>
}

interface TopicNavItem {
  id: string
  name: string
  orderIndex: number
  progress: Array<{
    notesCompleted: boolean
    examplesCompleted: boolean
    quizCompleted: boolean
    quizScore: number | null
  }>
}

interface TopicLearningInterfaceProps {
  topic: Topic
  allTopics: TopicNavItem[]
  userId: string
  initialTab?: ContentType | null
}

const contentTypeToTab: Record<string, ContentType> = {
  section_notes: 'notes',
  solved_examples: 'solved_examples',
  interactive_examples: 'interactive_examples',
  topic_quiz: 'quiz',
}

const normalizeRequestedTab = (value: string | null | undefined): ContentType | null => {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'notes') return 'notes'
  if (normalized === 'solved_examples') return 'solved_examples'
  if (normalized === 'interactive_examples') return 'interactive_examples'
  if (normalized === 'quiz') return 'quiz'
  if (normalized === 'voice_drill') return 'voice_drill'
  if (normalized === 'generate') return 'generate'
  return null
}

const flattenText = (value: unknown, sink: string[]) => {
  if (value == null) return
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) sink.push(trimmed)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenText(entry, sink))
    return
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => flattenText(entry, sink))
  }
}

export function TopicLearningInterface({ topic, allTopics, userId, initialTab = null }: TopicLearningInterfaceProps) {
  const router = useRouter()
  const requestedTab = normalizeRequestedTab(initialTab)
  const [contentItems, setContentItems] = useState<TopicContentItem[]>(topic.content || [])

  const progress = topic.progress[0] || {
    notesCompleted: false,
    examplesCompleted: false,
    quizCompleted: false,
    quizScore: null,
  }

  // Get content by type
  const getContent = (type: string) => {
    return contentItems.find(c => c.contentType === type)
  }

  const sectionNotes = getContent('section_notes')
  const solvedExamples = getContent('solved_examples')
  const interactiveExamples = getContent('interactive_examples')
  const topicQuiz = getContent('topic_quiz')
  const quizSets = useMemo(() => {
    if (!topic.topicQuizzes || topic.topicQuizzes.length === 0) return []
    return topic.topicQuizzes.map((quiz) => ({
      id: quiz.id,
      questions: quiz.questions,
      createdAt: quiz.createdAt,
    }))
  }, [topic.topicQuizzes])

  const voiceContext = useMemo(() => {
    const parts: string[] = []
    if (topic.description) {
      parts.push(`Topic summary: ${topic.description}`)
    }

    if (sectionNotes?.contentData) {
      const noteParts: string[] = []
      flattenText(sectionNotes.contentData, noteParts)
      const notesText = noteParts.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 6000)
      if (notesText) {
        parts.push(`Section notes context:\n${notesText}`)
      }
    }

    const latestQuizQuestions = (quizSets[0]?.questions || topicQuiz?.contentData || []) as Array<any>
    if (Array.isArray(latestQuizQuestions) && latestQuizQuestions.length > 0) {
      const quizConcepts = latestQuizQuestions
        .slice(0, 6)
        .map((q: any, index: number) => {
          const questionText = typeof q?.question_text === 'string' ? q.question_text.trim() : ''
          if (!questionText) return null
          return `${index + 1}. ${questionText}`
        })
        .filter((entry: string | null): entry is string => Boolean(entry))
      if (quizConcepts.length > 0) {
        parts.push(`Representative conceptual prompts:\n${quizConcepts.join('\n')}`)
      }
    }

    return parts.join('\n\n').trim()
  }, [quizSets, sectionNotes?.contentData, topic.description, topicQuiz?.contentData])

  useEffect(() => {
    setContentItems(topic.content || [])
  }, [topic.id, topic.content])

  // Navigation
  const currentIndex = allTopics.findIndex(t => t.id === topic.id)
  const previousTopic = currentIndex > 0 ? allTopics[currentIndex - 1] : null
  const nextTopic = currentIndex < allTopics.length - 1 ? allTopics[currentIndex + 1] : null

  const tabs = useMemo(() => [
    {
      id: 'notes' as ContentType,
      label: 'Section Notes',
      icon: BookOpen,
      available: !!sectionNotes,
      completed: progress.notesCompleted,
    },
    {
      id: 'solved_examples' as ContentType,
      label: 'Solved Examples',
      icon: Code,
      available: !!solvedExamples,
      completed: progress.examplesCompleted,
    },
    {
      id: 'interactive_examples' as ContentType,
      label: 'Practice',
      icon: HelpCircle,
      available: !!interactiveExamples,
      completed: progress.examplesCompleted,
    },
    {
      id: 'quiz' as ContentType,
      label: 'Quiz',
      icon: ClipboardList,
      available: !!topicQuiz || quizSets.length > 0,
      completed: progress.quizCompleted,
    },
    {
      id: 'voice_drill' as ContentType,
      label: 'Voice Coach',
      icon: Mic,
      available: !!sectionNotes || !!topicQuiz || quizSets.length > 0,
      completed: false,
    },
    {
      id: 'generate' as ContentType,
      label: 'Open Generator',
      icon: Sparkles,
      available: true,
      completed: false,
    },
  ], [sectionNotes, solvedExamples, interactiveExamples, topicQuiz, quizSets.length, progress.notesCompleted, progress.examplesCompleted, progress.quizCompleted])

  const visibleTabs = useMemo(() => {
    const generateTab = tabs.find((tab) => tab.id === 'generate')
    const coreTabs = tabs.filter((tab) => tab.id !== 'generate')
    return generateTab ? [generateTab, ...coreTabs] : coreTabs
  }, [tabs])

  const defaultTab = useMemo(() => {
    const firstAvailable = tabs.find((tab) => tab.available)
    return (firstAvailable?.id ?? 'generate') as ContentType
  }, [tabs])

  const resolveInitialTab = useCallback((): ContentType => {
    if (requestedTab) {
      const requested = tabs.find((tab) => tab.id === requestedTab)
      if (requested?.available) {
        return requestedTab
      }
    }
    return defaultTab
  }, [defaultTab, requestedTab, tabs])

  const [activeTab, setActiveTab] = useState<ContentType>(resolveInitialTab)
  const previousTopicIdRef = useRef(topic.id)
  const contentAreaRef = useRef<HTMLDivElement | null>(null)

  const learningTabs = useMemo(
    () => tabs.filter((tab) => tab.id !== 'generate' && tab.available),
    [tabs]
  )

  const activeLearningIndex = useMemo(
    () => learningTabs.findIndex((tab) => tab.id === activeTab),
    [activeTab, learningTabs]
  )

  const previousLearningTab = activeLearningIndex > 0 ? learningTabs[activeLearningIndex - 1] : null
  const nextLearningTab = activeLearningIndex >= 0 && activeLearningIndex < learningTabs.length - 1
    ? learningTabs[activeLearningIndex + 1]
    : null
  const firstLearningTab = learningTabs[0] ?? null

  useEffect(() => {
    if (previousTopicIdRef.current === topic.id) {
      return
    }
    previousTopicIdRef.current = topic.id
    setActiveTab(resolveInitialTab())
  }, [topic.id, resolveInitialTab])

  const missingCoreCount = useMemo(() => {
    const quizAvailable = !!topicQuiz || quizSets.length > 0
    const coreAvailable = [sectionNotes, solvedExamples, interactiveExamples, quizAvailable].filter(Boolean).length
    return Math.max(0, 4 - coreAvailable)
  }, [sectionNotes, solvedExamples, interactiveExamples, topicQuiz, quizSets.length])
  const readyCoreCount = 4 - missingCoreCount
  const learningProgress = useMemo(() => {
    let completed = 0
    let total = 0

    if (sectionNotes) {
      total++
      if (progress.notesCompleted) completed++
    }
    if (solvedExamples || interactiveExamples) {
      total++
      if (progress.examplesCompleted) completed++
    }
    if (topicQuiz || quizSets.length > 0) {
      total++
      if (progress.quizCompleted) completed++
    }

    return { completed, total }
  }, [
    sectionNotes,
    solvedExamples,
    interactiveExamples,
    topicQuiz,
    quizSets.length,
    progress.notesCompleted,
    progress.examplesCompleted,
    progress.quizCompleted,
  ])
  const progressValue = useMemo(() => {
    return learningProgress.total > 0
      ? (learningProgress.completed / learningProgress.total) * 100
      : 0
  }, [learningProgress])

  const handleContentUpdated = useCallback((content: TopicContentItem[]) => {
    setContentItems(content)
  }, [])

  const handleOpenContentTab = useCallback((contentType: string) => {
    const mappedTab = contentTypeToTab[contentType]
    if (mappedTab) {
      setActiveTab(mappedTab)
    }
  }, [])

  const handleNavigate = (topicId: string) => {
    router.push(`/projects/${topic.project.id}/topics/${topicId}`)
  }

  const handleSelectTab = useCallback((tabId: ContentType) => {
    setActiveTab(tabId)
    if (tabId === 'generate') {
      requestAnimationFrame(() => {
        contentAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [])

  const generatorLabel = missingCoreCount > 0 ? 'Generate Content' : 'Open Generator'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="hero-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                variant="back"
                size="back"
                onClick={() => router.push(`/projects/${topic.project.id}`)}
              >
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Back to Project
              </Button>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
                <span>{topic.project.name}</span>
                <ChevronRight className="h-4 w-4" />
                <span>Topic {topic.orderIndex + 1}</span>
              </div>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">{topic.name}</h1>
            {topic.description && (
              <p className="text-muted-foreground">{topic.description}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {tabs
                .filter((tab) => tab.available && tab.id !== 'generate')
                .map((tab) => (
                  <span
                    key={`chip-${tab.id}`}
                    className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary/80"
                  >
                    {tab.label}
                  </span>
                ))}
            </div>
          </div>
          <div className="w-full lg:w-auto">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-border/70 bg-white/75 px-4 py-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Learning Tracks
                </div>
                <div className="mt-1 text-2xl font-semibold font-mono-ui">
                  {Math.round(progressValue)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {learningProgress.completed} track{learningProgress.completed === 1 ? '' : 's'} complete
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                  Tracks: Notes, Examples (Solved + Practice), and Quiz.
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-white/75 px-4 py-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <Layers3 className="h-3.5 w-3.5" />
                  Core Blocks
                </div>
                <div className="mt-1 text-2xl font-semibold font-mono-ui">
                  {readyCoreCount}/4
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-white/75 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Quiz Sets</div>
                <div className="mt-1 text-2xl font-semibold font-mono-ui">
                  {Math.max(quizSets.length, topicQuiz ? 1 : 0)}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-start lg:justify-end">
              <Button
                onClick={() => handleSelectTab('generate')}
                variant={missingCoreCount > 0 ? 'default' : 'outline'}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {generatorLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <Progress value={progressValue} className="h-2" />

      {/* Tabs */}
      <Card className="overflow-hidden border-primary/15 bg-white/80">
        <CardContent className="py-4 md:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <Button
                    key={tab.id}
                    variant="ghost"
                    onClick={() => handleSelectTab(tab.id)}
                    disabled={!tab.available && activeTab !== tab.id}
                    className={`tab-pill flex items-center gap-2 ${activeTab === tab.id ? 'tab-pill-active' : ''} ${!tab.available && activeTab !== tab.id ? 'opacity-60 grayscale' : ''}`}
                    title={!tab.available ? 'Generate this content first' : tab.label}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.completed && tab.id !== 'generate' && (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                  </Button>
                )
              })}
            </div>
            <div className="rounded-full border border-border/70 bg-white/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {missingCoreCount > 0
                ? `${missingCoreCount} block${missingCoreCount === 1 ? '' : 's'} missing`
                : 'All core blocks ready'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      <div ref={contentAreaRef} className="min-h-[600px]">
        {activeTab === 'notes' && sectionNotes && (
          <SectionNotesViewer
            content={sectionNotes.contentData}
            metadata={sectionNotes.metadata}
            topicId={topic.id}
            userId={userId}
            isCompleted={progress.notesCompleted}
          />
        )}

        {activeTab === 'solved_examples' && solvedExamples && (
          <SolvedExamplesViewer
            examples={solvedExamples.contentData}
            metadata={solvedExamples.metadata}
            topicId={topic.id}
            userId={userId}
            isCompleted={progress.examplesCompleted}
          />
        )}

        {activeTab === 'interactive_examples' && interactiveExamples && (
          <InteractiveExamplesViewer
            examples={interactiveExamples.contentData}
            metadata={interactiveExamples.metadata}
            topicId={topic.id}
            userId={userId}
            isCompleted={progress.examplesCompleted}
          />
        )}

        {activeTab === 'quiz' && (topicQuiz || quizSets.length > 0) && (
          <QuizInterface
            quizSets={quizSets}
            fallbackQuestions={topicQuiz?.contentData || []}
            metadata={topicQuiz?.metadata || {}}
            topicId={topic.id}
            userId={userId}
            isCompleted={progress.quizCompleted}
          />
        )}

        {activeTab === 'voice_drill' && (sectionNotes || topicQuiz || quizSets.length > 0) && (
          <VoiceCoach
            mode="topic_drill"
            projectId={topic.project.id}
            topicId={topic.id}
            title={`Voice Coach: ${topic.name}`}
            topicName={topic.name}
            topicDescription={topic.description}
            contextText={voiceContext}
          />
        )}

        {activeTab === 'generate' && (
          <ContentGenerator
            topic={{
              id: topic.id,
              name: topic.name,
              description: topic.description ?? null,
            }}
            onContentUpdated={handleContentUpdated}
            onOpenContentTab={handleOpenContentTab}
          />
        )}

        {!tabs.find(t => t.id === activeTab)?.available && (
          <Card>
            <CardContent className="py-12 text-center">
              <Circle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Content Not Generated</h3>
              <p className="text-muted-foreground mb-4">
                This content hasn&apos;t been generated yet. Go back to the content generation page to create it.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  onClick={() => handleSelectTab('generate')}
                >
                  Generate Content
                </Button>
                <Button
                  onClick={() => router.push(`/projects/${topic.project.id}`)}
                  variant="back"
                  size="back"
                >
                  Back to Project
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {activeTab !== 'generate' && previousLearningTab ? (
                <Button variant="outline" onClick={() => handleSelectTab(previousLearningTab.id)}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous: {previousLearningTab.label}
                </Button>
              ) : previousTopic ? (
                <Button variant="outline" onClick={() => handleNavigate(previousTopic.id)}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous Topic: {previousTopic.name}
                </Button>
              ) : null}
            </div>

            <Button
              variant="back"
              size="back"
              onClick={() => router.push(`/projects/${topic.project.id}`)}
            >
              Back to Topics
            </Button>

            <div>
              {activeTab !== 'generate' && nextLearningTab ? (
                <Button variant="outline" onClick={() => handleSelectTab(nextLearningTab.id)}>
                  Next: {nextLearningTab.label}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : activeTab === 'generate' && firstLearningTab ? (
                <Button variant="outline" onClick={() => handleSelectTab(firstLearningTab.id)}>
                  Start: {firstLearningTab.label}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : nextTopic ? (
                <Button variant="outline" onClick={() => handleNavigate(nextTopic.id)}>
                  Next Topic: {nextTopic.name}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
