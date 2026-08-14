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

// ==============================================
// EMAIL TEMPLATE
// ==============================================
// Mirrors the app's design tokens (globals.css) so a message reads as the same
// product as the page it links to.
//
// Email is not the web: no external stylesheets, no custom fonts, no flexbox
// in Outlook. Everything below is therefore table-based with inline styles,
// which is the only layout that renders consistently across Gmail, Outlook and
// Apple Mail.

const BRAND_NAME = 'Hawaiʻi Bill Tracker';

/** Design tokens from globals.css, resolved to hex — email clients have no CSS variables. */
const T = {
  primary: '#1F5C5E', // --primary, deep teal
  primaryText: '#FFFFFF', // --primary-foreground
  background: '#FAF8F5', // --background, warm cream
  card: '#FFFFFF', // --card
  foreground: '#2D3436', // --foreground
  muted: '#6C757D', // --muted-foreground
  border: '#E5E0D8', // --border, warm
  olive: '#A8B660', // --olive, the header's accent rule
  radius: '8px', // --radius (0.5rem)
} as const;

// Geist isn't available to mail clients; this stack is the closest widely
// supported approximation.
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Wraps message content in the shared shell: cream backdrop, white card, teal
 * brand band with the olive rule that echoes the app header's border-bottom.
 *
 * @param preheader Inbox preview text. Hidden in the body — without it clients
 *                  scrape the first visible words, which is usually the heading
 *                  repeated back at the reader.
 */
function renderEmailShell({
  heading,
  preheader,
  body,
}: {
  heading: string;
  preheader: string;
  body: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0; padding:0; background-color:${T.background}; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; visibility:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${T.background};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:${T.card}; border:1px solid ${T.border}; border-radius:${T.radius}; overflow:hidden;">
          <tr>
            <td style="background-color:${T.primary}; border-bottom:3px solid ${T.olive}; padding:20px 32px;">
              <span style="font-family:${FONT_STACK}; font-size:17px; font-weight:600; color:${T.primaryText}; letter-spacing:-0.01em;">${BRAND_NAME}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px; font-family:${FONT_STACK}; font-size:22px; line-height:1.3; font-weight:600; color:${T.foreground};">${escapeHtml(heading)}</h1>
              ${body}
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
          <tr>
            <td style="padding:16px 32px; font-family:${FONT_STACK}; font-size:12px; line-height:1.5; color:${T.muted};">
              ${BRAND_NAME} — tracking food and agriculture legislation in Hawaiʻi.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Body paragraph at the shared type scale. */
function p(html: string, extraStyle = ''): string {
  return `<p style="margin:0 0 16px; font-family:${FONT_STACK}; font-size:15px; line-height:1.6; color:${T.foreground}; ${extraStyle}">${html}</p>`;
}

/**
 * Primary call to action. A table rather than a styled <a> because Outlook
 * ignores padding on inline elements, which would collapse the button.
 */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="background-color:${T.primary}; border-radius:${T.radius};">
        <a href="${href}" style="display:inline-block; padding:13px 28px; font-family:${FONT_STACK}; font-size:15px; font-weight:600; color:${T.primaryText}; text-decoration:none;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * Fallback URL. Always shown: some clients strip buttons, and a reader who
 * can't click needs the raw link rather than a dead end.
 */
function fallbackLink(url: string): string {
  return `${p(
    `Or paste this link into your browser:`,
    `margin-bottom:6px; font-size:13px; color:${T.muted};`,
  )}
  <p style="margin:0 0 20px; font-family:${FONT_STACK}; font-size:13px; line-height:1.5; word-break:break-all;"><a href="${url}" style="color:${T.primary};">${url}</a></p>`;
}

/** Closing note — expiry and "ignore this" reassurance, visually de-emphasised. */
function footnote(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px; border-top:1px solid ${T.border};">
    <tr>
      <td style="padding-top:16px; font-family:${FONT_STACK}; font-size:13px; line-height:1.6; color:${T.muted};">${html}</td>
    </tr>
  </table>`;
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
      subject: `Verify your email address for ${BRAND_NAME}`,
      html: renderEmailShell({
        // Raw, not escaped: renderEmailShell escapes `heading` itself, so
        // pre-escaping here would render as O&amp;#039;Brien.
        heading: `Welcome, ${username}`,
        preheader: 'Confirm your email address to finish setting up your account.',
        body: `
          ${p('Thanks for registering. Confirm your email address to finish setting up your account.')}
          ${button(verificationUrl, 'Verify email address')}
          ${fallbackLink(verificationUrl)}
          ${footnote("If you didn't create an account, you can ignore this email.")}
        `,
      }),
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
      subject: `Reset your ${BRAND_NAME} password`,
      html: renderEmailShell({
        heading: 'Reset your password',
        preheader: 'Choose a new password — this link expires in 1 hour.',
        body: `
          ${p(`Hi ${escapeHtml(username)},`)}
          ${p('We received a request to reset your password. Choose a new one below.')}
          ${button(resetUrl, 'Reset password')}
          ${fallbackLink(resetUrl)}
          ${footnote(
            'This link expires in <strong>1 hour</strong> and can only be used once. ' +
              "If you didn't request a password reset, you can ignore this email — your password will not change.",
          )}
        `,
      }),
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
      // Subject lines are plain text, not HTML — escaping here would surface
      // literal &amp; in the inbox. The HTML body still escapes orgName.
      subject: `You've been invited to join ${orgName} on ${BRAND_NAME}`,
      html: renderEmailShell({
        heading: "You're invited",
        preheader: `Join ${orgName} on ${BRAND_NAME}.`,
        body: `
          ${p(`You've been invited to join <strong>${escapeHtml(orgName)}</strong> on ${BRAND_NAME}.`)}
          ${p('Create your account to see the bills they’re tracking and work alongside them.')}
          ${button(inviteUrl, `Join ${orgName}`)}
          ${fallbackLink(inviteUrl)}
          ${footnote(
            'This invite expires in <strong>48 hours</strong>. ' +
              "If you weren't expecting it, you can ignore this email.",
          )}
        `,
      }),
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
