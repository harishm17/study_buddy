import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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
