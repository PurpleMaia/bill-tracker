import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/auth-guards';
import { getOrgBoardContents, getOrgBoardInfo } from '@/db/queries/org-board';

// Fetch arm for data.boards.getMyOrgBoard: an org admin's preview of their own
// board as visitors see it, available even while the board is private.
export async function GET(request: NextRequest) {
  try {
    const tenantId = new URL(request.url).searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }
    await requireAdmin.fromRequest(request, tenantId);

    const org = await getOrgBoardInfo(tenantId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    const contents = await getOrgBoardContents(org.id);
    return NextResponse.json(
      {
        org: { tenantId: org.id, name: org.name, slug: org.slug, description: org.description },
        publicBoard: org.public_board,
        ...contents,
      },
      { status: 200 },
    );
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in my org board GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
