import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/db/queries/tenants';
import { updateBillStatus, untrackBill } from '@/db/queries/bills-write';
import { getBillDetails, getVersionHtmlLinks } from '@/db/queries/bills-read';
import { updateBillTags } from '@/db/queries/tags';
import { compareVersionHtml } from '@/services/bill-diff';
import { limitFixedWindow, retryAfterMs } from '@/lib/ratelimit-memory';
import { getClientIp } from '@/lib/client-ip';

/**
 * Per-IP ceiling on the version-diff branch. Bill text is public record, so this
 * branch stays readable without a session (matching compareVersionsAction, which
 * uses optionalSession) — but "no login required" must not mean "unmetered".
 * A cold comparison costs two ~2 MB fetches against data.capitol.hawaii.gov plus
 * two full document parses, so an unmetered anonymous endpoint would make this
 * app an amplifier against a state government host.
 *
 * This is the per-CALLER limit. compareVersionHtml separately limits per version
 * PAIR, which bounds total work across all callers and covers the action arm too.
 */
const DIFF_IP_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);

    // Version-diff branch: /api/bills/[id]?resource=version-diff&olderId=..&newerId=..
    if (url.searchParams.get('resource') === 'version-diff') {
      const rl = limitFixedWindow(
        `version-diff:${getClientIp(request)}`,
        DIFF_IP_RATE_LIMIT.limit,
        DIFF_IP_RATE_LIMIT.windowMs,
      );
      if (!rl.ok) {
        return NextResponse.json(
          { error: 'Too many comparison requests. Please try again shortly.' },
          {
            status: 429,
            headers: { 'Retry-After': Math.ceil(retryAfterMs(rl.resetAt) / 1000).toString() },
          },
        );
      }

      const olderId = url.searchParams.get('olderId');
      const newerId = url.searchParams.get('newerId');
      if (!olderId || !newerId) {
        return NextResponse.json(
          { error: 'olderId and newerId are required' },
          { status: 400 },
        );
      }
      const { older, newer } = await getVersionHtmlLinks(id, olderId, newerId);
      const comparison = await compareVersionHtml({
        olderLabel: older?.label ?? 'older',
        newerLabel: newer?.label ?? 'newer',
        olderUrl: older?.htmlLink ?? null,
        newerUrl: newer?.htmlLink ?? null,
      });
      return NextResponse.json({ comparison }, { status: 200 });
    }

    const bill = await getBillDetails(id);
    return NextResponse.json({ bill }, { status: 200 });
  } catch (error: any) {
    console.error('Error in bill GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    const { id: billId } = await params;
    const body = await request.json();
    const { tenantId, action } = body;

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    switch (action) {
      case 'updateStatus': {
        const { newStatus } = body;
        const bill = await updateBillStatus(billId, newStatus, tenantId);
        return NextResponse.json({ bill }, { status: 200 });
      }
      case 'updateTags': {
        if (!tenantId) {
          return NextResponse.json({ error: 'tenantId is required for tag updates' }, { status: 400 });
        }
        const { tagIds } = body;
        const tags = await updateBillTags(billId, tagIds, tenantId);
        return NextResponse.json({ tags }, { status: 200 });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bill PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    const { id: billId } = await params;
    const body = await request.json();
    const { tenantId } = body;

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    await untrackBill(user.id, billId, tenantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bill DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
