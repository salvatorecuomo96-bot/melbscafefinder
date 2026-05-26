import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, suburb, address, instagram, website, note, email } = req.body || {};

  if (!name?.trim() || !suburb?.trim()) {
    return res.status(400).json({ error: 'Name and suburb are required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const resend = new Resend(apiKey);

  const html = `
    <h2>New cafe submission</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#666">Cafe name</td><td><strong>${name}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Suburb</td><td>${suburb}</td></tr>
      ${address ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Address</td><td>${address}</td></tr>` : ''}
      ${instagram ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Instagram</td><td>${instagram}</td></tr>` : ''}
      ${website ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Website</td><td><a href="${website}">${website}</a></td></tr>` : ''}
      ${note ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Note</td><td>${note}</td></tr>` : ''}
      ${email ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Submitter email</td><td>${email}</td></tr>` : ''}
    </table>
  `;

  const toEmail = process.env.RESEND_TO_EMAIL || 'salvatore.cuomo96@gmail.com';
  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: [toEmail],
    subject: `Cafe submission: ${name} (${suburb})`,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
