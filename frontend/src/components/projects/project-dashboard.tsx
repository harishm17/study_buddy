'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ArrowLeft,
  FileText,
  BookOpen,
  ClipboardCheck,
  Upload,
  Plus,
  Clock,
  Award,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Mic,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { NextActionsCard } from '@/components/learning/next-actions-card';

interface Material {
  id: string;
  filename: string;
  category: string;
  validationStatus: string;
  validationNotes: string | null;
  sizeBytes: string;
  uploadedAt: string;
}

interface TopicProgress {
  notesCompleted: boolean;
  examplesCompleted: boolean;
  quizCompleted: boolean;
  quizScore: number | null;
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
  orderIndex: number;
  userConfirmed: boolean;
  contentCount: number;
  progress: TopicProgress | null;
}

interface Exam {
  id: string;
  name: string;
  durationMinutes: number;
  difficultyLevel: string;
  topicsCovered: string[];
  createdAt: string;
  submissionsCount: number;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  materials: Material[];
  topics: Topic[];
  exams: Exam[];
}

interface ProjectDashboardProps {
  project: Project;
  initialTab?: 'materials' | 'topics' | 'exams';
}

export default function ProjectDashboard({ project, initialTab }: ProjectDashboardProps) {
  const router = useRouter();
  const confirmedTopicsCount = project.topics.filter((topic) => topic.userConfirmed).length;
  const unconfirmedTopicsCount = project.topics.length - confirmedTopicsCount;
  const needsTopicConfirmation = unconfirmedTopicsCount > 0;
  const resolvedInitialTab =
    initialTab ||
    (needsTopicConfirmation && project.topics.length > 0 ? 'topics' : 'materials');
  const [activeTab, setActiveTab] = useState<'materials' | 'topics' | 'exams'>(resolvedInitialTab);

  useEffect(() => {
    setActiveTab(resolvedInitialTab);
  }, [resolvedInitialTab]);
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);
  const [confirmingTopics, setConfirmingTopics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validMaterialsCount = project.materials.filter(
    (material) => material.validationStatus === 'valid'
  ).length;
  const pendingMaterialsCount = project.materials.filter(
    (material) => material.validationStatus === 'pending'
  ).length;

  const handleDeleteMaterial = async (materialId: string) => {
    setDeletingMaterialId(materialId);
    setError(null);

    try {
      const response = await fetch(`/api/materials/${materialId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete material');
      }

      // Refresh the page
      router.refresh();
    } catch (error) {
      console.error('Error deleting material:', error);
      setError('Failed to delete material. Please try again.');
    } finally {
      setDeletingMaterialId(null);
    }
  };

  const handleQuickConfirmTopics = async () => {
    setConfirmingTopics(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.id}/topics/confirm`, {
        method: 'POST',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Failed to confirm topics');
      }

      setActiveTab('topics');
      router.refresh();
    } catch (confirmError) {
      console.error('Error confirming topics:', confirmError);
      setError(confirmError instanceof Error ? confirmError.message : 'Failed to confirm topics');
    } finally {
      setConfirmingTopics(false);
    }
  };

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'lecture_notes':
        return <FileText className="h-4 w-4" />;
      case 'book_chapters':
        return <BookOpen className="h-4 w-4" />;
      case 'sample_exams':
        return <ClipboardCheck className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'lecture_notes':
        return 'Lecture Notes';
      case 'book_chapters':
        return 'Book Chapters';
      case 'sample_exams':
        return 'Sample Exams';
      default:
        return category;
    }
  };

  const getTopicProgress = (topic: Topic) => {
    if (!topic.progress) return 0;
    let completed = 0;
    if (topic.progress.notesCompleted) completed++;
    if (topic.progress.examplesCompleted) completed++;
    if (topic.progress.quizCompleted) completed++;
    return (completed / 3) * 100;
  };

  const getStatusBadge = (status: string) => {
    if (needsTopicConfirmation) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Topics Review</Badge>;
    }
    switch (status) {
      case 'setup':
        return <Badge variant="outline">Setup in progress</Badge>;
      case 'topics_pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Topics Review</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReadinessLabel = (status: string) => {
    if (needsTopicConfirmation) {
      return 'Awaiting topic confirmation';
    }
    if (status === 'setup' && validMaterialsCount > 0) {
      return pendingMaterialsCount > 0 ? 'Processing materials' : 'Ready to extract topics';
    }
    switch (status) {
      case 'setup':
        return 'Setup in progress';
      case 'topics_pending':
        return 'Awaiting topic confirmation';
      case 'active':
        return 'Ready for study';
      case 'completed':
        return 'Course cycle completed';
      default:
        return status.replaceAll('_', ' ');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="hero-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2.5">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="back" size="back">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
              Project Overview
            </div>
            <h1 className="text-4xl font-semibold tracking-tight">{project.name}</h1>
            {project.description && (
              <p className="max-w-2xl text-muted-foreground">{project.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {getStatusBadge(project.status)}
              <span className="text-sm text-muted-foreground">
                Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-white/75 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Readiness</div>
            <div className="text-xl font-semibold">{getReadinessLabel(project.status)}</div>
          </div>
        </div>
      </div>

      {/* Status Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {project.status === 'setup' && project.materials.length === 0 && (
        <Alert>
          <Upload className="h-4 w-4" />
          <AlertDescription>
            Get started by uploading your study materials (PDF, DOCX, PPTX, DOC). We&apos;ll process them, then you can
            extract and confirm your topic list.
          </AlertDescription>
        </Alert>
      )}

      {needsTopicConfirmation && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Topics are ready to review. Confirm the final list before generating study content.
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push(`/projects/${project.id}/topics/review`)}>
                Review Topics
              </Button>
              <Button size="sm" onClick={handleQuickConfirmTopics} disabled={confirmingTopics}>
                {confirmingTopics ? 'Confirming...' : 'Confirm Topics'}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{project.materials.length}</div>
                <div className="text-sm text-muted-foreground">Materials</div>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{project.topics.length}</div>
                <div className="text-sm text-muted-foreground">Topics</div>
              </div>
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{project.exams.length}</div>
                <div className="text-sm text-muted-foreground">Sample Exams</div>
              </div>
              <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('materials')}
            className={`tab-pill ${
              activeTab === 'materials'
                ? 'tab-pill-active'
                : ''
            }`}
          >
            Materials ({project.materials.length})
          </button>
          <button
            onClick={() => setActiveTab('topics')}
            className={`tab-pill ${
              activeTab === 'topics'
                ? 'tab-pill-active'
                : ''
            }`}
          >
            Topics ({project.topics.length})
          </button>
          <button
            onClick={() => setActiveTab('exams')}
            className={`tab-pill ${
              activeTab === 'exams'
                ? 'tab-pill-active'
                : ''
            }`}
          >
            Exams ({project.exams.length})
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-4">
        <NextActionsCard projectId={project.id} compact autoStartBatchGeneration />

        {/* Materials Tab */}
        {activeTab === 'materials' && (
          <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Study Materials</h2>
            <Button onClick={() => router.push(`/projects/${project.id}/upload`)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Materials
            </Button>
          </div>

          {project.topics.length === 0 && validMaterialsCount > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {pendingMaterialsCount > 0
                    ? 'Materials are still processing. You can continue once processing completes.'
                    : 'Materials are validated. Continue to extract and confirm your topic list.'}
                </span>
                <Button
                  size="sm"
                  onClick={() => router.push(`/projects/${project.id}/topics/review`)}
                  disabled={pendingMaterialsCount > 0}
                >
                  {pendingMaterialsCount > 0 ? 'Processing...' : 'Continue to Topics'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {project.materials.length === 0 ? (
            <Card>
              <CardContent className="pt-6 md:pt-6 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No materials uploaded yet</p>
                <Button onClick={() => router.push(`/projects/${project.id}/upload`)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Your First Material
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {project.materials.map((material) => (
                <Card key={material.id} className="overflow-hidden">
                  <CardContent className="py-5 md:py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/70">
                          {getCategoryIcon(material.category)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-medium">{material.filename}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <Badge variant="outline">{getCategoryLabel(material.category)}</Badge>
                            <span>{formatFileSize(material.sizeBytes)}</span>
                            <span>
                              {formatDistanceToNow(new Date(material.uploadedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          {material.validationStatus === 'valid' && (
                            <div className="mt-2 flex items-center gap-1 text-sm text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              Validated
                            </div>
                          )}
                          {material.validationStatus === 'invalid' && (
                            <div className="mt-2 flex items-center gap-1 text-sm text-red-600">
                              <AlertCircle className="h-4 w-4" />
                              {material.validationNotes || 'Validation failed'}
                            </div>
                          )}
                        </div>
                      </div>
                      <ConfirmDialog
                        title="Delete material?"
                        description={`"${material.filename}" will be removed permanently.`}
                        confirmLabel="Delete"
                        variant="destructive"
                        disabled={deletingMaterialId === material.id}
                        onConfirm={() => handleDeleteMaterial(material.id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="self-center"
                            onClick={(event) => event.stopPropagation()}
                            disabled={deletingMaterialId === material.id}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>
        )}

        {/* Topics Tab */}
        {activeTab === 'topics' && (
          <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Learning Topics</h2>
              {needsTopicConfirmation && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {unconfirmedTopicsCount} topic{unconfirmedTopicsCount !== 1 ? 's' : ''} pending confirmation
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {needsTopicConfirmation && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/projects/${project.id}/topics/review`)}
                >
                  Review Topics
                </Button>
              )}
              {needsTopicConfirmation && (
                <Button
                  onClick={handleQuickConfirmTopics}
                  disabled={confirmingTopics}
                >
                  {confirmingTopics ? 'Confirming...' : 'Confirm Topics'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => router.push(`/projects/${project.id}/voice-sprint`)}
                disabled={project.topics.length === 0}
              >
                <Mic className="h-4 w-4 mr-2" />
                Voice Sprint
              </Button>
              <Button
                onClick={() => router.push(`/projects/${project.id}/generate-exam`)}
                disabled={confirmedTopicsCount === 0}
                title={confirmedTopicsCount === 0 ? 'Confirm topics before creating an exam' : undefined}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Sample Exam
              </Button>
            </div>
          </div>

          {project.topics.length === 0 ? (
            <Card>
              <CardContent className="pt-6 md:pt-6 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  No topics extracted yet.
                </p>
                {validMaterialsCount > 0 ? (
                  <Button onClick={() => router.push(`/projects/${project.id}/topics/review`)}>
                    Extract Topics
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => router.push(`/projects/${project.id}/upload`)}>
                    Upload Materials
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {needsTopicConfirmation && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Confirm topics to unlock exam generation and stabilize your next study actions.
                  </AlertDescription>
                </Alert>
              )}
              {project.topics.map((topic) => {
                const progress = getTopicProgress(topic);
                return (
                  <Card
                    key={topic.id}
                    className="cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/35"
                    onClick={() => router.push(`/projects/${project.id}/topics/${topic.id}`)}
                  >
                    <CardContent className="py-5 md:py-5">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-lg">{topic.name}</div>
                              {!topic.userConfirmed && needsTopicConfirmation && (
                                <Badge variant="secondary" className="text-xs">
                                  Needs confirmation
                                </Badge>
                              )}
                            </div>
                            {topic.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {topic.description}
                              </p>
                            )}
                          </div>
                          {topic.progress?.quizScore !== null && topic.progress?.quizScore !== undefined && (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <Award className="h-3 w-3 mr-1" />
                              {Math.round(topic.progress?.quizScore ?? 0)}%
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{Math.round(progress)}%</span>
                          </div>
                          <Progress value={progress} />
                        </div>

                        <div className="flex gap-2 text-xs">
                          {topic.contentCount > 0 ? (
                            <Badge variant="outline" className="bg-green-50">
                              {topic.contentCount} content items
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-50">
                              Content not generated
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          </div>
        )}

        {/* Exams Tab */}
        {activeTab === 'exams' && (
          <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Sample Exams</h2>
            <Button onClick={() => router.push(`/projects/${project.id}/generate-exam`)}>
              <Plus className="h-4 w-4 mr-2" />
              Create New Exam
            </Button>
          </div>

          {project.exams.length === 0 ? (
            <Card>
              <CardContent className="pt-6 md:pt-6 text-center">
                <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No sample exams created yet</p>
                <Button onClick={() => router.push(`/projects/${project.id}/generate-exam`)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Exam
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {project.exams.map((exam) => (
                <Card
                  key={exam.id}
                  className="cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/35"
                  onClick={() => router.push(`/exams/${exam.id}`)}
                >
                  <CardContent className="py-5 md:py-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{exam.name}</div>
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {exam.durationMinutes} min
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {exam.difficultyLevel}
                          </Badge>
                          <span>
                            {formatDistanceToNow(new Date(exam.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {exam.topicsCovered.slice(0, 3).map((topic, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                          {exam.topicsCovered.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{exam.topicsCovered.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                      {exam.submissionsCount > 0 && (
                        <Badge variant="outline">
                          {exam.submissionsCount} attempt{exam.submissionsCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}
