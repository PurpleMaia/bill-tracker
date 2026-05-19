import { NextRequest, NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth';
import { registerSchema } from '@/lib/validators';
import { setSessionCookie } from '@/lib/cookies';
import { createTenant, addMember, getUserMemberships } from '@/services/data/tenants';
// import { sendVerificationEmail } from '@/services/email';

// Allowed email domains
// const ALLOWED_EMAIL_DOMAINS = [
//   '@purplemaia.org',
//   // Add more domains here as needed
// ];

// function isValidEmailDomain(email: string): boolean {
//   const emailDomain = email.substring(email.lastIndexOf('@'));
//   return ALLOWED_EMAIL_DOMAINS.includes(emailDomain);
// }

export async function POST(req: NextRequest) {
  try {
    const { username, email, password, orgName } = await req.json();
    const validation = registerSchema.safeParse({ username, email, password });
    if (!validation.success) {
      const messages = validation.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }

    // Validate orgName if provided
    if (orgName !== undefined && orgName !== null) {
      const trimmed = typeof orgName === 'string' ? orgName.trim() : '';
      if (trimmed.length === 0 || trimmed.length > 100) {
        return NextResponse.json({ error: 'Organization name must be between 1 and 100 characters.' }, { status: 400 });
      }
    }

    // Validate email domain
    // if (!isValidEmailDomain(email)) {
    //   return NextResponse.json({ 
    //     error: `Registration is only allowed for email addresses ending in: ${ALLOWED_EMAIL_DOMAINS.join(', ')}` 
    //   }, { status: 403 });
    // }

    const { user } = await registerUser(email, username, password);
    if (!user) {
      return NextResponse.json({ error: 'User already exists or registration failed.' }, { status: 400 });
    }

    // If orgName provided, create the organization and add user as admin
    let tenant = null;
    if (orgName && typeof orgName === 'string' && orgName.trim().length > 0) {
      const trimmedName = orgName.trim();
      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50);

      try {
        tenant = await createTenant(trimmedName, slug);
        await addMember(tenant.id, user.id, 'admin');
      } catch (orgError) {
        console.error('Failed to create organization:', orgError);
      }
    }

    // Auto-login: create session and return cookie + memberships
    const token = await createSession(user.id);
    const memberships = await getUserMemberships(user.id);

    return NextResponse.json(
      {
        success: true,
        user,
        memberships,
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': setSessionCookie(token),
        },
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration error.' }, { status: 500 });
  }
}
