import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { canBeTopicSource, isMaterialRole } from '@/lib/materials/role';

const roleSchema = z.object({
  role: z.string().refine(isMaterialRole, 'Role must be content, syllabus, exam or other'),
});

/**
 * PATCH /api/materials/[materialId]  { role: 'content' | 'syllabus' | 'exam' | 'other' }
 *
 * The student's say on what a file is for. A syllabus or past exam is never a topic source: when a
 * file becomes one, the topic sources and chunk mappings that came from it are removed, so topics
 * stop being taught from it at once (the content already written stays). Making a file content
 * again adds nothing by itself; "Find topics again" places its sections.
 * 200: { material: { id, role, removedSources } }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { materialId } = await params;

    const parsed = roleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
    }
    const role = parsed.data.role as 'content' | 'syllabus' | 'exam' | 'other';

    const material = await prisma.material.findFirst({
      where: { id: materialId, project: { userId: session.user.id } },
      select: { id: true },
    });
    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    const removedSources = await prisma.$transaction(async (tx) => {
      await tx.material.update({ where: { id: materialId }, data: { role } });
      if (canBeTopicSource(role)) return 0;
      const removed = await tx.topicSource.deleteMany({ where: { materialId } });
      await tx.topicChunkMapping.deleteMany({ where: { chunk: { materialId } } });
      return removed.count;
    });

    return NextResponse.json({ material: { id: materialId, role, removedSources } });
  } catch (error) {
    console.error('Error updating material:', error);
    return NextResponse.json({ error: 'Failed to update material' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { materialId } = await params;

    // Fetch material and verify ownership
    const material = await prisma.material.findFirst({
      where: {
        id: materialId,
        project: {
          userId: session.user.id,
        },
      },
      select: {
        id: true,
        gcsPath: true,
        projectId: true,
      },
    });

    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    // Delete the database record first (cascades to chunks and mappings). If that fails
    // nothing has been lost; a storage failure afterwards only leaves an unreferenced file.
    await prisma.material.delete({
      where: { id: materialId },
    });

    if (material.gcsPath) {
      const { deleteFilesBestEffort } = await import('@/lib/storage/gcs');
      // Logs the path of any file it could not remove.
      await deleteFilesBestEffort([material.gcsPath]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting material:', error);
    return NextResponse.json(
      { error: 'Failed to delete material' },
      { status: 500 }
    );
  }
}
