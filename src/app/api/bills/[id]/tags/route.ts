import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../db/kysely/client';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { tagsSchema } from '@/lib/validators';
import { validateMembership } from '@/services/data/tenants';

// GET - Get tags for a specific bill (requires tenant context)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;

    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ tags: [] });
    }

    let user;
    try {
      user = await validateSession(sessionToken);
    } catch {
      return NextResponse.json({ tags: [] });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ tags: [] });
    }

    await validateMembership(user.id, tenantId);

    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    return NextResponse.json({ tags });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching bill tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill tags' },
      { status: 500 }
    );
  }
}

// POST - Add tags to a bill (admin and supervisor only, requires tenant context)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = getSessionCookie(request);
    const user = await validateSession(sessionToken);

    if (user.role !== 'admin' && user.role !== 'supervisor') {
      return NextResponse.json(
        { error: 'Forbidden: Only admins and supervisors can tag bills' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tagIds, tenantId } = body;
    const { id: billId } = await params;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    await validateMembership(user.id, tenantId);

    const validation = tagsSchema.safeParse({ tagIds });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues.map(i => i.message).join(', ') }, { status: 400 });
    }

    const bill = await db
      .selectFrom('bills')
      .select('id')
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Remove existing tags for this bill that belong to this tenant
    await db
      .deleteFrom('bill_tags')
      .where('bill_id', '=', billId)
      .where('tag_id', 'in',
        db.selectFrom('tags').select('id').where('tenant_id', '=', tenantId)
      )
      .execute();

    if (tagIds.length > 0) {
      const validTags = await db
        .selectFrom('tags')
        .select('id')
        .where('id', 'in', tagIds as string[])
        .where('tenant_id', '=', tenantId)
        .execute();

      if (validTags.length !== tagIds.length) {
        return NextResponse.json(
          { error: 'One or more tag IDs are invalid' },
          { status: 400 }
        );
      }

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

    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    return NextResponse.json({ tags });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating bill tags:', error);
    return NextResponse.json(
      { error: 'Failed to update bill tags' },
      { status: 500 }
    );
  }
}
