'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, BookOpen, Code, HelpCircle, ClipboardList, CheckCircle, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SectionNotesViewer } from './section-notes-viewer'
import { SolvedExamplesViewer } from './solved-examples-viewer'
import { InteractiveExamplesViewer } from './interactive-examples-viewer'
import { QuizInterface } from './quiz-interface'

type ContentType = 'notes' | 'solved_examples' | 'interactive_examples' | 'quiz'

interface Topic {
  id: string
  name: string
  description: string | null
  orderIndex: number
  project: {
    id: string
    name: string
  }
  content: Array<{
    id: string
    contentType: string
    contentData: any
    metadata: any
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
}

export function TopicLearningInterface({ topic, allTopics, userId }: TopicLearningInterfaceProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ContentType>('notes')

  const progress = topic.progress[0] || {
    notesCompleted: false,
    examplesCompleted: false,
    quizCompleted: false,
    quizScore: null,
  }

  // Get content by type
  const getContent = (type: string) => {
    return topic.content.find(c => c.contentType === type)
  }

  const sectionNotes = getContent('section_notes')
  const solvedExamples = getContent('solved_examples')
  const interactiveExamples = getContent('interactive_examples')
  const topicQuiz = getContent('topic_quiz')

  // Navigation
  const currentIndex = allTopics.findIndex(t => t.id === topic.id)
  const previousTopic = currentIndex > 0 ? allTopics[currentIndex - 1] : null
  const nextTopic = currentIndex < allTopics.length - 1 ? allTopics[currentIndex + 1] : null

  // Calculate overall progress
  const calculateProgress = () => {
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
    if (topicQuiz) {
      total++
      if (progress.quizCompleted) completed++
    }

    return total > 0 ? (completed / total) * 100 : 0
  }

  const tabs = [
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
      available: !!topicQuiz,
      completed: progress.quizCompleted,
    },
  ]

  const handleNavigate = (topicId: string) => {
    router.push(`/projects/${topic.project.id}/topics/${topicId}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>{topic.project.name}</span>
            <ChevronRight className="h-4 w-4" />
            <span>Topic {topic.orderIndex + 1}</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">{topic.name}</h1>
          {topic.description && (
            <p className="text-muted-foreground">{topic.description}</p>
          )}
        </div>

        {/* Progress Badge */}
        <div className="text-right">
          <div className="text-2xl font-bold mb-1">
            {Math.round(calculateProgress())}%
          </div>
          <div className="text-xs text-muted-foreground">Complete</div>
        </div>
      </div>

      {/* Progress Bar */}
      <Progress value={calculateProgress()} className="h-2" />

      {/* Tabs */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'outline'}
                  onClick={() => setActiveTab(tab.id)}
                  disabled={!tab.available}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.completed && (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  )}
                  {!tab.available && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Not Generated
                    </Badge>
                  )}
                </Button>
              )
            })}
          </div>
        </CardHeader>
      </Card>

      {/* Content Area */}
      <div className="min-h-[600px]">
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

        {activeTab === 'quiz' && topicQuiz && (
          <QuizInterface
            questions={topicQuiz.contentData}
            metadata={topicQuiz.metadata}
            topicId={topic.id}
            userId={userId}
            isCompleted={progress.quizCompleted}
            previousScore={progress.quizScore}
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
              <Button
                onClick={() => router.push(`/projects/${topic.project.id}`)}
                variant="outline"
              >
                Back to Project
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              {previousTopic && (
                <Button
                  variant="outline"
                  onClick={() => handleNavigate(previousTopic.id)}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous: {previousTopic.name}
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              onClick={() => router.push(`/projects/${topic.project.id}`)}
            >
              Back to Topics
            </Button>

            <div>
              {nextTopic && (
                <Button
                  variant="outline"
                  onClick={() => handleNavigate(nextTopic.id)}
                >
                  Next: {nextTopic.name}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
