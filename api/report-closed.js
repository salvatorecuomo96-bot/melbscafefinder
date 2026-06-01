import { Resend } from 'resend';

function asText(value, max = 500) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cafeId = asText(req.body?.cafeId);
  const cafeName = asText(req.body?.cafeName);
  const suburb = asText(req.body?.suburb);

  if (!cafeId || !cafeName) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const resend = new Resend(apiKey);
  const toEmail = process.env.RESEND_TO_EMAIL || 'salvatore.cuomo96@gmail.com';

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to: [toEmail],
    subject: `Closure report: ${cafeName}${suburb ? ` (${suburb})` : ''}`,
    html: `
      <p>A user reported that <strong>${escapeHtml(cafeName)}</strong>${suburb ? ` in ${escapeHtml(suburb)}` : ''} may be permanently closed.</p>
      <p>Cafe ID: <code>${escapeHtml(cafeId)}</code></p>
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    return res.status(500).json({ error: 'Unable to send report right now' });
  }

  return res.status(200).json({ ok: true });
}
