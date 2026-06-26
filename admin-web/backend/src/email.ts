'use strict';
import nodemailer from 'nodemailer';

// Brevo SMTP — EU-native, GDPR-compliant transactional email.
// Credentials from env; falls back to console log in dev.
const transporter = nodemailer.createTransport(
  process.env.BREVO_SMTP_KEY
    ? {
        host: 'smtp-relay.brevo.com',
        port: 587,
        auth: {
          user: process.env.BREVO_SMTP_LOGIN!,
          pass: process.env.BREVO_SMTP_KEY!,
        },
      }
    : { jsonTransport: true } // dev: logs to console, no real sending
);

const FROM = process.env.EMAIL_FROM || 'billing@mwt.app';

export interface EmailResult {
  messageId: string | null;
}

export async function sendPaymentReceipt(opts: {
  to: string;
  invoiceNumber: string;
  productName: string;
  amountCents: number;
  netCents: number;
  vatCents: number;
  vatRate: number;
  currency: string;
  date: string;
  pdfBuffer?: Buffer;
}): Promise<EmailResult> {
  const gross = (opts.amountCents / 100).toFixed(2);
  const net   = (opts.netCents   / 100).toFixed(2);
  const vat   = (opts.vatCents   / 100).toFixed(2);
  const info = await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Your mwt receipt — ${opts.invoiceNumber}`,
    text: [
      `Thank you for your purchase.`,
      ``,
      `Product:       ${opts.productName}`,
      `Net amount:    ${opts.currency} ${net}`,
      `VAT (${opts.vatRate}%):   ${opts.currency} ${vat}`,
      `Total:         ${opts.currency} ${gross}`,
      `Invoice:       ${opts.invoiceNumber}`,
      `Date:          ${opts.date}`,
      ``,
      `mwt — messages with trust`,
      `For billing questions: billing@mwt.app`,
    ].join('\n'),
    html: receiptHtml(opts),
    attachments: opts.pdfBuffer
      ? [{ filename: `${opts.invoiceNumber}.pdf`, content: opts.pdfBuffer }]
      : [],
  });
  return { messageId: info.messageId ?? null };
}

export async function sendGdprConfirmation(opts: {
  to: string;
  requestType: string;
  dueDate: string;
  referenceId: number;
}): Promise<EmailResult> {
  const info = await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Your GDPR ${opts.requestType} request — ref #${opts.referenceId}`,
    text: [
      `We have received your ${opts.requestType} request (ref #${opts.referenceId}).`,
      ``,
      `We will respond by: ${opts.dueDate}`,
      ``,
      `Under GDPR Article 12 we have 30 days to respond.`,
      `If you have questions, reply to this email.`,
      ``,
      `mwt — messages with trust`,
    ].join('\n'),
  });
  return { messageId: info.messageId ?? null };
}

export async function sendCancellationConfirmation(opts: {
  to: string;
  refNumber: string;
  tier: string;
  isCoolingOff: boolean;
  refundIssued?: boolean;
  effectiveDate: string;
}): Promise<EmailResult> {
  const subject = opts.isCoolingOff
    ? `Cancellation confirmed (14-day right) — ${opts.refNumber}`
    : `Subscription cancelled — ${opts.refNumber}`;

  const coolingOffNote = opts.isCoolingOff
    ? opts.refundIssued
      ? [`Your refund has been submitted to your payment provider. Allow 3–5 business`,
         `days to appear depending on your bank (EU Consumer Rights Directive Art. 9).`,
         ``].join('\n')
      : [`A full refund will be processed within 14 days (EU Consumer Rights Directive`,
         `Art. 9). If you do not receive it, contact billing@mwt.app with ref ${opts.refNumber}.`,
         ``].join('\n')
    : '';

  const info = await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject,
    text: [
      `Your mwt subscription has been cancelled.`,
      ``,
      `Plan:           ${opts.tier}`,
      `Effective date: ${opts.effectiveDate}`,
      `Reference:      ${opts.refNumber}`,
      ``,
      coolingOffNote,
      `Your account returns to the free Pigeon tier. Your messages and contacts`,
      `remain intact — only paid features are disabled.`,
      ``,
      `You can resubscribe at any time from within the app.`,
      ``,
      `If you did not request this cancellation, please contact billing@mwt.app`,
      `immediately.`,
      ``,
      `mwt — messages with trust`,
    ].join('\n'),
    html: cancellationHtml(opts),
  });
  return { messageId: info.messageId ?? null };
}

export async function sendAccountDeletionConfirmation(opts: {
  to: string;
  accountPin: string;
  deletedAt: string;
}): Promise<EmailResult> {
  const info = await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Your mwt account has been deleted`,
    text: [
      `Your mwt account (PIN: ${opts.accountPin}) has been permanently deleted.`,
      ``,
      `Deleted at: ${opts.deletedAt}`,
      ``,
      `All messages, contacts, and device data have been destroyed on our relay.`,
      `We cannot recover this data — it is gone.`,
      ``,
      `Billing records are retained for 7 years as required by EU tax law (Art. 52`,
      `VAT Directive), then permanently deleted. No message content is retained.`,
      ``,
      `If this was not you, someone with access to your device or recovery phrase`,
      `initiated this deletion. Your data is already gone — contact billing@mwt.app`,
      `to flag potential account compromise.`,
      ``,
      `mwt — messages with trust`,
    ].join('\n'),
  });
  return { messageId: info.messageId ?? null };
}

function cancellationHtml(opts: {
  refNumber: string; tier: string; isCoolingOff: boolean;
  refundIssued?: boolean; effectiveDate: string;
}): string {
  const coolingNote = opts.isCoolingOff
    ? opts.refundIssued
      ? `<p style="background:#e8f5ee;padding:12px;border-radius:4px;font-size:13px">
          <b>Refund submitted</b> — allow 3–5 business days depending on your bank.
          EU Consumer Rights Directive Art. 9 (14-day withdrawal right).
         </p>`
      : `<p style="background:#fef3c7;padding:12px;border-radius:4px;font-size:13px">
          A full refund will be processed within 14 days (EU Consumer Rights Directive Art. 9).
          If not received, email <a href="mailto:billing@mwt.app">billing@mwt.app</a>
          quoting ref <b>${opts.refNumber}</b>.
         </p>`
    : '';
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#222">
<h2 style="color:#1a7a3c">Subscription cancelled</h2>
${coolingNote}
<table style="width:100%;border-collapse:collapse;margin-top:16px">
  <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>Plan</b></td><td>${opts.tier}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>Effective</b></td><td>${opts.effectiveDate}</td></tr>
  <tr><td style="padding:8px 0"><b>Reference</b></td><td>${opts.refNumber}</td></tr>
</table>
<p style="margin-top:16px">Your account returns to the free <b>Pigeon</b> tier.
Messages and contacts are intact — only paid features are disabled.</p>
<p>You can resubscribe at any time from within the app.</p>
<p style="color:#dc2626;font-size:13px">
  If you did not request this, contact <a href="mailto:billing@mwt.app">billing@mwt.app</a> immediately.
</p>
<p style="color:#666;font-size:13px;margin-top:32px">mwt — messages with trust</p>
</body></html>`;
}

function receiptHtml(opts: {
  invoiceNumber: string; productName: string;
  amountCents: number; netCents: number; vatCents: number; vatRate: number;
  currency: string; date: string;
}): string {
  const gross = (opts.amountCents / 100).toFixed(2);
  const net   = (opts.netCents   / 100).toFixed(2);
  const vat   = (opts.vatCents   / 100).toFixed(2);
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#222">
<h2 style="color:#1a7a3c">mwt receipt</h2>
<table style="width:100%;border-collapse:collapse">
  <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>Product</b></td><td>${opts.productName}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>Net</b></td><td>${opts.currency} ${net}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>VAT ${opts.vatRate}%</b></td><td>${opts.currency} ${vat}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>Total</b></td><td><b>${opts.currency} ${gross}</b></td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>Invoice</b></td><td>${opts.invoiceNumber}</td></tr>
  <tr><td style="padding:8px 0"><b>Date</b></td><td>${opts.date}</td></tr>
</table>
<p style="color:#666;font-size:13px;margin-top:32px">
  mwt — messages with trust<br>
  Billing: billing@mwt.app
</p>
</body></html>`;
}
