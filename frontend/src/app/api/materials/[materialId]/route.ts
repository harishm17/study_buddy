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

    // Delete file from GCS first (before deleting database record)
    if (material.gcsPath) {
      try {
        const { deleteFile } = await import('@/lib/storage/gcs');
        await deleteFile(material.gcsPath);
      } catch (error) {
        console.error('Error deleting file from GCS:', error);
        // Continue with database deletion even if GCS deletion fails
        // Log the error for manual cleanup if needed
      }
    }

    // Delete material (cascades to chunks and mappings)
    await prisma.material.delete({
      where: { id: materialId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting material:', error);
    return NextResponse.json(
      { error: 'Failed to delete material' },
      { status: 500 }
    );
  }
}
