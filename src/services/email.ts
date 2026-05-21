import { Resend } from 'resend';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendVerificationEmail(email: string, username: string, verificationToken: string) {
  // Check if Resend is configured
  if (!resend) {
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/verify-email?token=${verificationToken}`;
    console.warn('⚠️  RESEND_API_KEY not configured. Email sending disabled.');
    console.log('📧 Verification URL for manual testing:', verificationUrl);
    // In development, allow registration without email
    if (process.env.NODE_ENV === 'development') {
      return { success: true, data: { message: 'Email service not configured, but registration allowed in development' } };
    }
    return { success: false, error: 'Email service not configured' };
  }

  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/verify-email?token=${verificationToken}`;

  // Always log the verification URL for debugging (especially in dev)
  console.log('📧 Verification URL (always logged):', verificationUrl);
  
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  console.log('📧 Attempting to send email:');
  console.log('   From:', fromEmail);
  console.log('   To:', email);
  console.log('   Subject: Verify your email address');

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Verify your email address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome, ${escapeHtml(username)}!</h2>
          <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            If you didn't create an account, please ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Resend API error:', JSON.stringify(error, null, 2));
      console.error('❌ Error details:', error);
      if (error.message) {
        console.error('❌ Error message:', error.message);
      }
      if (error.name) {
        console.error('❌ Error name:', error.name);
      }
      console.log('📧 Verification URL (use this to verify manually):', verificationUrl);
      
      // Check common error reasons
      if (error.message?.includes('domain') || error.message?.includes('not verified')) {
        console.error('⚠️  Common issue: The "from" email domain is not verified in Resend.');
        console.error('   Solution: Verify your domain in Resend dashboard or use onboarding@resend.dev for testing');
      }
      if (error.message?.includes('invalid') || error.message?.includes('Invalid')) {
        console.error('⚠️  Common issue: Invalid email address or API key.');
      }
      
      return { success: false, error };
    }

    console.log('✅ Verification email sent successfully!');
    console.log('   Email ID:', data?.id);
    console.log('   Sent to:', email);
    console.log('📧 Verification URL (if email not received, use this):', verificationUrl);
    return { success: true, data };
  } catch (error: any) {
    console.error('❌ Exception sending verification email:', error);
    console.error('❌ Exception details:', JSON.stringify(error, null, 2));
    if (error?.message) {
      console.error('❌ Exception message:', error.message);
    }
    console.log('📧 Verification URL (use this to verify manually):', verificationUrl);
    return { success: false, error };
  }
}

export async function sendInviteEmail(email: string, orgName: string, inviteToken: string) {
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/register?invite=${inviteToken}`;

  if (!resend) {
    console.warn('⚠️  RESEND_API_KEY not configured. Email sending disabled.');
    console.log('📧 Invite URL for manual testing:', inviteUrl);
    if (process.env.NODE_ENV === 'development') {
      return { success: true, data: { message: 'Email service not configured, but invite created in development' } };
    }
    return { success: false, error: 'Email service not configured' };
  }

  console.log('📧 Invite URL (always logged):', inviteUrl);

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `You've been invited to join ${escapeHtml(orgName)} on Food+`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You're invited!</h2>
          <p>You've been invited to join <strong>${escapeHtml(orgName)}</strong> on Food+.</p>
          <p>Click the button below to create your account and get started:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Join ${escapeHtml(orgName)}
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${inviteUrl}</p>
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            This invite expires in 48 hours. If you didn't expect this invitation, please ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Resend API error (invite):', JSON.stringify(error, null, 2));
      console.log('📧 Invite URL (use this manually):', inviteUrl);
      return { success: false, error };
    }

    console.log('✅ Invite email sent successfully to:', email);
    return { success: true, url: inviteUrl, data };
  } catch (error: any) {
    console.error('❌ Exception sending invite email:', error);
    console.log('📧 Invite URL (use this manually):', inviteUrl);
    return { success: false, error };
  }
}
