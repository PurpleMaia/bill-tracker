import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { db } from '../../../../db/kysely/client';
import crypto from 'crypto';
import { nicknameSchema } from '@/lib/auth/validators';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);

    const { billId, nickname } = await request.json();
    const validation = nicknameSchema.safeParse({ nickname });
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues.map(i => i.message).join(', ') },
        { status: 400 }
      );
    }    

    const trimmedNickname =
      typeof nickname === 'string' ? nickname.trim().slice(0, 80) : '';

    // Ensure the user actually adopted this bill
    const adoption = await (db as any)
      .selectFrom('user_bills')
      .select('id')
      .where('user_id', '=', user.id)
      .where('bill_id', '=', billId)
      .executeTakeFirst();

    if (!adoption) {
      return NextResponse.json(
        { success: false, error: 'You have not adopted this bill' },
        { status: 403 }
      );
    }

    if (!trimmedNickname) {
      // Clear nickname
      await (db as any)
        .deleteFrom('user_bill_preferences')
        .where('user_id', '=', user.id)
        .where('bill_id', '=', billId)
        .execute();

      return NextResponse.json({ success: true, nickname: null });
    }

    const existing = await (db as any)
      .selectFrom('user_bill_preferences')
      .select(['id'])
      .where('user_id', '=', user.id)
      .where('bill_id', '=', billId)
      .executeTakeFirst();

    if (existing) {
      await (db as any)
        .updateTable('user_bill_preferences')
        .set({
          nickname: trimmedNickname,
          updated_at: new Date(),
        })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await (db as any)
        .insertInto('user_bill_preferences')
        .values({
          id: crypto.randomUUID(),
          user_id: user.id,
          bill_id: billId,
          nickname: trimmedNickname,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    }

    return NextResponse.json({
      success: true,
      nickname: trimmedNickname,
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('Failed to save nickname:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save nickname' },
      { status: 500 }
    );
  }
}

