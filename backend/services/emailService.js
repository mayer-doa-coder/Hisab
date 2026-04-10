const nodemailer = require('nodemailer');

const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
const SMTP_SECURE = toBoolean(process.env.SMTP_SECURE, SMTP_PORT === 465);
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const MAIL_FROM = String(process.env.MAIL_FROM || process.env.SMTP_FROM || SMTP_USER || '').trim();
const MAIL_REPLY_TO = String(process.env.MAIL_REPLY_TO || '').trim();

const APP_NAME = String(process.env.APP_DISPLAY_NAME || 'Hisab').trim() || 'Hisab';
const APP_SUPPORT = String(process.env.APP_SUPPORT_EMAIL || MAIL_REPLY_TO || MAIL_FROM || '').trim();

const emailDeliveryRequired = isProduction || toBoolean(process.env.REQUIRE_EMAIL_DELIVERY, false);

const isEmailTransportConfigured = () => {
  if (!SMTP_HOST || !Number.isFinite(SMTP_PORT) || SMTP_PORT <= 0 || !MAIL_FROM) {
    return false;
  }

  if (SMTP_USER && !SMTP_PASS) {
    return false;
  }

  return true;
};

let smtpTransporter = null;

const getTransporter = () => {
  if (!isEmailTransportConfigured()) {
    return null;
  }

  if (smtpTransporter) {
    return smtpTransporter;
  }

  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return smtpTransporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  if (!to || !subject || (!text && !html)) {
    return {
      delivered: false,
      reason: 'INVALID_EMAIL_PAYLOAD',
    };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const reason = 'EMAIL_TRANSPORT_NOT_CONFIGURED';

    if (!emailDeliveryRequired) {
      console.warn(`[EMAIL] ${reason}. to=${to} subject=${subject}`);
      return {
        delivered: false,
        reason,
      };
    }

    return {
      delivered: false,
      reason,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text,
      html,
      ...(MAIL_REPLY_TO ? { replyTo: MAIL_REPLY_TO } : {}),
    });

    return {
      delivered: true,
      reason: null,
      messageId: info?.messageId || null,
    };
  } catch (error) {
    return {
      delivered: false,
      reason: 'EMAIL_DELIVERY_FAILED',
      errorMessage: String(error?.message || 'unknown-email-error'),
    };
  }
};

const formatExpiresAt = (expiresAt) => {
  if (!expiresAt) {
    return 'soon';
  }

  try {
    return new Date(expiresAt).toLocaleString('en-US', {
      hour12: true,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return String(expiresAt);
  }
};

const sendVerificationCodeEmail = async ({ to, code, expiresAt }) => {
  const expiresLabel = formatExpiresAt(expiresAt);
  const subject = `${APP_NAME} email verification code`;
  const text = [
    `Your ${APP_NAME} verification code is: ${code}`,
    '',
    `This code expires at ${expiresLabel}.`,
    'If you did not request this, you can ignore this email.',
    APP_SUPPORT ? `Support: ${APP_SUPPORT}` : '',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#102a43;max-width:560px;margin:0 auto;">
      <h2 style="margin:0 0 12px;">Verify your email</h2>
      <p style="margin:0 0 12px;">Use this code to continue in ${APP_NAME}:</p>
      <p style="margin:0 0 16px;font-size:28px;letter-spacing:6px;font-weight:700;">${code}</p>
      <p style="margin:0 0 10px;">This code expires at <strong>${expiresLabel}</strong>.</p>
      <p style="margin:0;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
};

const sendPinRecoveryEmail = async ({ to, resetToken, expiresAt }) => {
  const expiresLabel = formatExpiresAt(expiresAt);
  const subject = `${APP_NAME} PIN reset token`;
  const text = [
    `Your ${APP_NAME} PIN reset token is: ${resetToken}`,
    '',
    `This token expires at ${expiresLabel}.`,
    'Use this token in the app reset PIN screen.',
    'If you did not request this, you can ignore this email.',
    APP_SUPPORT ? `Support: ${APP_SUPPORT}` : '',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#102a43;max-width:560px;margin:0 auto;">
      <h2 style="margin:0 0 12px;">Reset your PIN</h2>
      <p style="margin:0 0 12px;">Use this token in the app reset screen:</p>
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;word-break:break-all;">${resetToken}</p>
      <p style="margin:0 0 10px;">This token expires at <strong>${expiresLabel}</strong>.</p>
      <p style="margin:0;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
};

module.exports = {
  isEmailTransportConfigured,
  isEmailDeliveryRequired: () => emailDeliveryRequired,
  sendVerificationCodeEmail,
  sendPinRecoveryEmail,
  sendPasswordRecoveryEmail: sendPinRecoveryEmail,
};
