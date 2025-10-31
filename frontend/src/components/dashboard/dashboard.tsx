'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  BookOpen,
  FileText,
  ClipboardCheck,
  GraduationCap,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  materialsCount: number;
  topicsCount: number;
  examsCount: number;
}

interface User {
  name: string;
  email: string;
}

interface DashboardProps {
  projects: Project[];
  user: User;
}

export default function Dashboard({ projects, user }: DashboardProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async () => {
    const name = prompt('Enter project name (e.g., "CS 3345 - Data Structures Final")');
    if (!name || !name.trim()) return;

    const description = prompt('Enter project description (optional)');

    setIsCreating(true);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description?.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const data = await response.json();
      router.push(`/projects/${data.project.id}`);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'setup':
        return (
          <Badge variant="outline" className="bg-gray-100">
            Setup
          </Badge>
        );
      case 'topics_pending':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            Review Topics
          </Badge>
        );
      case 'active':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Active
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="bg-blue-100 text-blue-800">
            Completed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold flex items-center gap-3">
            <GraduationCap className="h-10 w-10" />
            StudyBuddy
          </h1>
          <p className="text-muted-foreground mt-2">
            Welcome back, {user.name}! Ready to study?
          </p>
        </div>
        <Button onClick={handleCreateProject} disabled={isCreating} size="lg">
          <Plus className="h-5 w-5 mr-2" />
          New Project
        </Button>
      </div>

      {/* Stats Overview */}
      {projects.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{projects.length}</div>
                  <div className="text-sm text-muted-foreground">Projects</div>
                </div>
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">
                    {projects.reduce((sum, p) => sum + p.materialsCount, 0)}
                  </div>
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
                  <div className="text-2xl font-bold">
                    {projects.reduce((sum, p) => sum + p.topicsCount, 0)}
                  </div>
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
                  <div className="text-2xl font-bold">
                    {projects.reduce((sum, p) => sum + p.examsCount, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Exams</div>
                </div>
                <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projects List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Your Projects</h2>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="pt-16 pb-16 text-center">
              <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first study project to get started. Upload your course materials and
                let AI help you prepare for exams!
              </p>
              <Button onClick={handleCreateProject} disabled={isCreating} size="lg">
                <Plus className="h-5 w-5 mr-2" />
                Create Your First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-lg transition-all"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    {getStatusBadge(project.status)}
                  </div>
                  {project.description && (
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="text-center p-2 rounded-lg bg-accent">
                        <div className="font-bold">{project.materialsCount}</div>
                        <div className="text-xs text-muted-foreground">Materials</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-accent">
                        <div className="font-bold">{project.topicsCount}</div>
                        <div className="text-xs text-muted-foreground">Topics</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-accent">
                        <div className="font-bold">{project.examsCount}</div>
                        <div className="text-xs text-muted-foreground">Exams</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Updated{' '}
                      {formatDistanceToNow(new Date(project.updatedAt), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
