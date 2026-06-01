import { Resend } from 'resend';

const MAX_FIELD = 500;
const MAX_NOTE = 2000;

function asText(value, max = MAX_FIELD) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value) {
  const raw = asText(value);
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function tableRow(label, value, options = {}) {
  if (!value) return '';
  const safeLabel = escapeHtml(label);
  const safeValue = escapeHtml(value);
  const rendered = options.href
    ? `<a href="${escapeHtml(options.href)}" rel="noreferrer">${safeValue}</a>`
    : safeValue;
  return `<tr><td style="padding:4px 12px 4px 0;color:#666">${safeLabel}</td><td>${rendered}</td></tr>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const name = asText(body.name);
  const suburb = asText(body.suburb);
  const address = asText(body.address);
  const instagram = asText(body.instagram);
  const website = safeUrl(body.website);
  const note = asText(body.note, MAX_NOTE);
  const email = asText(body.email);

  if (!name || !suburb) {
    return res.status(400).json({ error: 'Name and suburb are required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const html = `
    <h2>New cafe submission</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${tableRow('Cafe name', name)}
      ${tableRow('Suburb', suburb)}
      ${tableRow('Address', address)}
      ${tableRow('Instagram', instagram)}
      ${tableRow('Website', website, { href: website })}
      ${tableRow('Note', note)}
      ${tableRow('Submitter email', email)}
    </table>
  `;

  const resend = new Resend(apiKey);
  const toEmail = process.env.RESEND_TO_EMAIL || 'salvatore.cuomo96@gmail.com';
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to: [toEmail],
    subject: `Cafe submission: ${name} (${suburb})`,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return res.status(500).json({ error: 'Unable to send submission right now' });
  }

  return res.status(200).json({ ok: true });
}
