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

/**
 * Logs a URL containing a live token, but only in local development.
 *
 * Every link this module sends carries a credential in its query string — a
 * reset token grants account takeover, an invite token grants org membership,
 * a verification token flips email_verified. Writing those to application logs
 * hands them to anyone with log access, so this is strictly a local-development
 * convenience: there is no inbox to check when running the dev server.
 */
function logTokenUrlInDevOnly(label: string, url: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`📧 [dev only] ${label}:`, url);
  }
}

export async function sendVerificationEmail(email: string, username: string, verificationToken: string) {
  // Check if Resend is configured
  if (!resend) {
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/verify-email?token=${verificationToken}`;
    console.warn('⚠️  RESEND_API_KEY not configured. Email sending disabled.');
    logTokenUrlInDevOnly('Verification URL (manual testing)', verificationUrl);
    // In development, allow registration without email
    if (process.env.NODE_ENV === 'development') {
      return { success: true, data: { message: 'Email service not configured, but registration allowed in development' } };
    }
    return { success: false, error: 'Email service not configured' };
  }

  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/verify-email?token=${verificationToken}`;

  logTokenUrlInDevOnly('Verification URL (pre-send)', verificationUrl);
  
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
      logTokenUrlInDevOnly('Verification URL (send failed)', verificationUrl);
      
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
    logTokenUrlInDevOnly('Verification URL (sent)', verificationUrl);
    return { success: true, data };
  } catch (error: any) {
    console.error('❌ Exception sending verification email:', error);
    console.error('❌ Exception details:', JSON.stringify(error, null, 2));
    if (error?.message) {
      console.error('❌ Exception message:', error.message);
    }
    logTokenUrlInDevOnly('Verification URL (send failed)', verificationUrl);
    return { success: false, error };
  }
}

export async function sendPasswordResetEmail(email: string, username: string, resetToken: string) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/reset-password?token=${resetToken}`;

  if (!resend) {
    console.warn('⚠️  RESEND_API_KEY not configured. Email sending disabled.');
    logTokenUrlInDevOnly('Password reset URL (manual testing)', resetUrl);
    if (process.env.NODE_ENV === 'development') {
      return { success: true, data: { message: 'Email service not configured, but reset token created in development' } };
    }
    return { success: false, error: 'Email service not configured' };
  }

  logTokenUrlInDevOnly('Password reset URL (pre-send)', resetUrl);

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Reset your Food+ password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Hi ${escapeHtml(username)},</p>
          <p>We received a request to reset your Food+ password. Click the button below to choose a new one:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            This link expires in 1 hour and can only be used once. If you didn't request a password reset,
            you can safely ignore this email — your password will not change.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Resend API error (password reset):', JSON.stringify(error, null, 2));
      logTokenUrlInDevOnly('Password reset URL (send failed)', resetUrl);
      return { success: false, error };
    }

    console.log('✅ Password reset email sent successfully to:', email);
    return { success: true, data };
  } catch (error: any) {
    console.error('❌ Exception sending password reset email:', error);
    logTokenUrlInDevOnly('Password reset URL (exception)', resetUrl);
    return { success: false, error };
  }
}

export async function sendInviteEmail(email: string, orgName: string, inviteToken: string) {
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/register?invite=${inviteToken}`;

  if (!resend) {
    console.warn('⚠️  RESEND_API_KEY not configured. Email sending disabled.');
    logTokenUrlInDevOnly('Invite URL (manual testing)', inviteUrl);
    if (process.env.NODE_ENV === 'development') {
      return { success: true, data: { message: 'Email service not configured, but invite created in development' } };
    }
    return { success: false, error: 'Email service not configured' };
  }

  logTokenUrlInDevOnly('Invite URL (pre-send)', inviteUrl);

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
      logTokenUrlInDevOnly('Invite URL (send failed)', inviteUrl);
      return { success: false, error };
    }

    console.log('✅ Invite email sent successfully to:', email);
    return { success: true, url: inviteUrl, data };
  } catch (error: any) {
    console.error('❌ Exception sending invite email:', error);
    logTokenUrlInDevOnly('Invite URL (send failed)', inviteUrl);
    return { success: false, error };
  }
}
