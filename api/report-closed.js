import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cafeId, cafeName, suburb } = req.body || {};
  if (!cafeId || !cafeName) return res.status(400).json({ error: 'Missing fields' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email service not configured' });

  const resend = new Resend(apiKey);
  const toEmail = process.env.RESEND_TO_EMAIL || 'salvatore.cuomo96@gmail.com';

  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: [toEmail],
    subject: `Closure report: ${cafeName} (${suburb})`,
    html: `<p>A user reported that <strong>${cafeName}</strong> in ${suburb} may be permanently closed.</p><p>Cafe ID: <code>${cafeId}</code></p>`,
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
