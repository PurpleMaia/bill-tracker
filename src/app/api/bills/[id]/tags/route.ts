import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../db/kysely/client';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { tagsSchema } from '@/lib/validators';

// GET - Get tags for a specific bill (public access for filtering)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;

    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .orderBy('t.name', 'asc')
      .execute();

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Error fetching bill tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill tags' },
      { status: 500 }
    );
  }
}

// POST - Add tags to a bill (admin and supervisor only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = getSessionCookie(request);
    const user = await validateSession(sessionToken);    

    // Only admin and supervisor can tag bills
    if (user.role !== 'admin' && user.role !== 'supervisor') {
      return NextResponse.json(
        { error: 'Forbidden: Only admins and supervisors can tag bills' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tagIds } = body;
    const { id: billId } = await params;

    const validation = tagsSchema.safeParse({ tagIds });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues.map(i => i.message).join(', ') }, { status: 400 });
    }

    // Check if bill exists
    const bill = await db
      .selectFrom('bills')
      .select('id')
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Remove existing tags for this bill
    await db
      .deleteFrom('bill_tags')
      .where('bill_id', '=', billId)
      .execute();

    // Add new tags
    if (tagIds.length > 0) {
      // Verify all tag IDs exist
      const validTags = await db
        .selectFrom('tags')
        .select('id')
        .where('id', 'in', tagIds as string[])
        .execute();

      if (validTags.length !== tagIds.length) {
        return NextResponse.json(
          { error: 'One or more tag IDs are invalid' },
          { status: 400 }
        );
      }

      // Insert new bill_tags
      await db
        .insertInto('bill_tags')
        .values(
          tagIds.map((tagId: string) => ({
            bill_id: billId,
            tag_id: tagId,
          }))
        )
        .execute();
    }

    // Fetch updated tags
    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .orderBy('t.name', 'asc')
      .execute();

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Error updating bill tags:', error);
    return NextResponse.json(
      { error: 'Failed to update bill tags' },
      { status: 500 }
    );
  }
}

