'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

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
}

export default function ProjectDashboard({ project }: ProjectDashboardProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'materials' | 'topics' | 'exams'>('materials');
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);

  const handleDeleteMaterial = async (materialId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingMaterialId(materialId);

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
      alert('Failed to delete material. Please try again.');
    } finally {
      setDeletingMaterialId(null);
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
    switch (status) {
      case 'setup':
        return <Badge variant="outline">Setup</Badge>;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {getStatusBadge(project.status)}
            <span className="text-sm text-muted-foreground">
              Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      {/* Status Alert */}
      {project.status === 'setup' && project.materials.length === 0 && (
        <Alert>
          <Upload className="h-4 w-4" />
          <AlertDescription>
            Get started by uploading your study materials (PDFs). We&apos;ll process them and extract
            key topics automatically.
          </AlertDescription>
        </Alert>
      )}

      {project.status === 'topics_pending' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Topics have been extracted! Review and confirm them in the Topics tab before generating
            study content.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4">
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
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('materials')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'materials'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Materials ({project.materials.length})
        </button>
        <button
          onClick={() => setActiveTab('topics')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'topics'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Topics ({project.topics.length})
        </button>
        <button
          onClick={() => setActiveTab('exams')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'exams'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Exams ({project.exams.length})
        </button>
      </div>

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

          {project.materials.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
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
                <Card key={material.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="p-2 rounded-lg bg-accent">
                          {getCategoryIcon(material.category)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{material.filename}</div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <Badge variant="outline">{getCategoryLabel(material.category)}</Badge>
                            <span>{formatFileSize(material.sizeBytes)}</span>
                            <span>
                              {formatDistanceToNow(new Date(material.uploadedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          {material.validationStatus === 'valid' && (
                            <div className="flex items-center gap-1 mt-2 text-sm text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              Validated
                            </div>
                          )}
                          {material.validationStatus === 'invalid' && (
                            <div className="flex items-center gap-1 mt-2 text-sm text-red-600">
                              <AlertCircle className="h-4 w-4" />
                              {material.validationNotes || 'Validation failed'}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMaterial(material.id, material.filename);
                        }}
                        disabled={deletingMaterialId === material.id}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
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
            <h2 className="text-2xl font-bold">Learning Topics</h2>
            <Button onClick={() => router.push(`/projects/${project.id}/generate-exam`)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Sample Exam
            </Button>
          </div>

          {project.topics.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  No topics extracted yet. Upload materials first.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {project.topics.map((topic) => {
                const progress = getTopicProgress(topic);
                return (
                  <Card
                    key={topic.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => router.push(`/projects/${project.id}/topics/${topic.id}`)}
                  >
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-lg">{topic.name}</div>
                            {topic.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {topic.description}
                              </p>
                            )}
                          </div>
                          {topic.progress?.quizScore !== null && (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <Award className="h-3 w-3 mr-1" />
                              {Math.round(topic.progress.quizScore)}%
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
              <CardContent className="pt-6 text-center">
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
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => router.push(`/exams/${exam.id}`)}
                >
                  <CardContent className="pt-6">
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
  );
}
