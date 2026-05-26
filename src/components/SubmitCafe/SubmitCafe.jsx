import { useEffect, useRef, useState } from 'react';
import './SubmitCafe.css';

export default function SubmitCafe({ open, onClose }) {
  const [form, setForm] = useState({ name: '', suburb: '', address: '', instagram: '', website: '', note: '', email: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    if (nameRef.current) nameRef.current.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.suburb.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/submit-cafe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Server error');
      setStatus('success');
      setForm({ name: '', suburb: '', address: '', instagram: '', website: '', note: '', email: '' });
    } catch {
      setStatus('error');
    }
  };

  const handleClose = () => {
    setStatus('idle');
    onClose();
  };

  return (
    <div className="submit-overlay" onClick={handleClose} role="dialog" aria-modal="true" aria-label="Submit a cafe">
      <div className="submit-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="submit-close" onClick={handleClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="submit-title">Submit a cafe</h2>
        <p className="submit-sub">Know a great Melbourne cafe we're missing? Tell us about it.</p>

        {status === 'success' ? (
          <div className="submit-success">
            <span className="submit-success__icon">✓</span>
            <p>Thanks! We'll review it and add it soon.</p>
            <button className="submit-btn" onClick={handleClose}>Close</button>
          </div>
        ) : (
          <form className="submit-form" onSubmit={handleSubmit}>
            <div className="submit-row submit-row--2">
              <label className="submit-field">
                <span>Cafe name *</span>
                <input ref={nameRef} value={form.name} onChange={set('name')} placeholder="e.g. St Ali" required />
              </label>
              <label className="submit-field">
                <span>Suburb *</span>
                <input value={form.suburb} onChange={set('suburb')} placeholder="e.g. South Yarra" required />
              </label>
            </div>

            <label className="submit-field">
              <span>Address</span>
              <input value={form.address} onChange={set('address')} placeholder="Street address" />
            </label>

            <div className="submit-row submit-row--2">
              <label className="submit-field">
                <span>Instagram</span>
                <input value={form.instagram} onChange={set('instagram')} placeholder="@handle" />
              </label>
              <label className="submit-field">
                <span>Website</span>
                <input value={form.website} onChange={set('website')} placeholder="https://..." type="url" />
              </label>
            </div>

            <label className="submit-field">
              <span>Why do you love it?</span>
              <textarea value={form.note} onChange={set('note')} placeholder="What makes it special..." rows={3} />
            </label>

            <label className="submit-field">
              <span>Your email (optional)</span>
              <input value={form.email} onChange={set('email')} placeholder="we'll let you know when it's live" type="email" />
            </label>

            {status === 'error' && (
              <p className="submit-error">Something went wrong. Try again.</p>
            )}

            <button className="submit-btn" type="submit" disabled={status === 'sending' || !form.name.trim() || !form.suburb.trim()}>
              {status === 'sending' ? 'Sending…' : 'Submit'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
