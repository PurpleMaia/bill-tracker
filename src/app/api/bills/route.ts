import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/services/data/tenants';
import {
  getAllTrackedBills,
  getAllFoodRelatedBills,
  getUserTrackedBills,
} from '@/services/data/bills-read';
import { trackBill } from '@/services/data/bills-write';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    const viewMode = searchParams.get('viewMode') || 'all-bills';
    const showArchived = searchParams.get('showArchived') === 'true';

    const sessionToken = getSessionCookie(request);
    let user = null;

    if (sessionToken) {
      try {
        user = await validateSession(sessionToken);
      } catch {
        // Not logged in, continue as public
      }
    }

    if (tenantId && user) {
      await validateMembership(user.id, tenantId);
    }

    let bills;
    if (user && viewMode === 'my-bills') { // "My Bills" = bills tracked by this user, regardless of tenant
      bills = await getUserTrackedBills(user.id, showArchived, true, tenantId);
    } else if (user && tenantId) { // "All Bills" for a tenant = all bills tracked by anyone in this tenant
      bills = await getAllTrackedBills(showArchived, tenantId, true);
    } else if (user) { // "All Bills" for public = all food-related bills tracked by anyone in Food+
      bills = await getAllFoodRelatedBills(showArchived, true, tenantId);
    } else { // Public view with no user = all food-related bills tracked by anyone in Food+
      bills = await getAllTrackedBills(showArchived);
    }

    return NextResponse.json({ bills }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bills GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);

    const body = await request.json();
    const { tenantId, billUrl } = body;

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    const bill = await trackBill(user.id, billUrl, tenantId);
    return NextResponse.json({ bill }, { status: 201 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bills POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
