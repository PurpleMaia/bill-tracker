import { NextRequest, NextResponse } from 'next/server';
import { getPublicBoardAction } from '@/app/actions/boards';

// Fetch arm for data.boards.getPublicBoard. No session: public_board means
// anyone can view the board. Thin transport over the action, so both arms
// share one lookup and one not-found rule.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const board = await getPublicBoardAction({ slug });
    return NextResponse.json(board, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in public board GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
