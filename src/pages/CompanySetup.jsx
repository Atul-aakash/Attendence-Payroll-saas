import { useState } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '../firebase';
import { SEED_HOLIDAYS } from '../seedData';
import { Zap, ChevronLeft, Building2 } from 'lucide-react';

const INDUSTRIES = [
  'Construction & Infrastructure',
  'Electrical & Engineering',
  'Manufacturing',
  'Retail & Trading',
  'IT & Software',
  'Healthcare',
  'Education',
  'Hospitality',
  'Logistics & Transport',
  'Other',
];

const COUNT_PRESETS = [1, 2, 3, 4];

export default function CompanySetup({ user, onComplete }) {
  // Step 1: org details  |  Step 2: firm count  |  Step 3: firm names
  const [step,        setStep]        = useState(1);

  // Step 1 fields
  const [orgName,     setOrgName]     = useState('');
  const [industry,    setIndustry]    = useState('');
  const [gst,         setGst]         = useState('');

  // Step 2 fields
  const [firmCount,   setFirmCount]   = useState(null);
  const [customCount, setCustomCount] = useState(5);
  const [showCustom,  setShowCustom]  = useState(false);

  // Step 3 fields
  const [firmNames,   setFirmNames]   = useState([]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Step 1 → 2 ─────────────────────────────────────────────────────────────
  const goToFirmCount = (e) => {
    e.preventDefault();
    if (!orgName.trim()) { setError('Please enter your organization name.'); return; }
    if (!industry)       { setError('Please select your industry.'); return; }
    setError('');
    setStep(2);
  };

  // ── Step 2 → 3 ─────────────────────────────────────────────────────────────
  const goToNames = (count) => {
    setFirmCount(count);
    // Pre-fill first firm with org name
    setFirmNames([orgName.trim(), ...Array(count - 1).fill('')]);
    setStep(3);
    setError('');
  };

  const updateName = (i, val) => {
    const next = [...firmNames];
    next[i] = val;
    setFirmNames(next);
    setError('');
  };

  // ── Final submit ────────────────────────────────────────────────────────────
  const handleSetup = async (e) => {
    e.preventDefault();
    if (firmNames.some((n) => !n.trim())) {
      setError('Please fill in all firm names.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const firms = firmNames.map((name, i) => ({
        id:   `${user.uid}_${i}`,
        name: name.trim(),
      }));

      const now = new Date().toISOString();

      // User profile (workspace root)
      await setDoc(doc(db, 'users', user.uid), {
        firms,
        email:     user.email || '',
        createdAt: now,
        role:      'admin',
        plan:      'trial',
        orgName:   orgName.trim(),
        industry,
        gst:       gst.trim(),
      });

      // Organization metadata
      await setDoc(doc(db, 'organizations', user.uid), {
        ownerUid:  user.uid,
        name:      orgName.trim(),
        industry,
        gst:       gst.trim(),
        email:     user.email || '',
        plan:      'trial',
        createdAt: now,
      });

      // Trial subscription record
      await setDoc(doc(db, 'subscriptions', user.uid), {
        plan:   'trial',
        status: 'trialing',
        razorpaySubscriptionId: null,
        currentPeriodEnd:       null,
        createdAt: now,
      });

      // Provision payroll sub-documents for each firm
      for (const firm of firms) {
        const base = (key) => doc(db, 'companies', firm.id, 'payroll', key);
        // Create company doc FIRST so ownership rules pass for sub-document reads
        await setDoc(doc(db, 'companies', firm.id), { ownerUid: user.uid, members: {} });
        const empSnap = await getDoc(base('employees'));
        if (!empSnap.exists()) {
          await setDoc(base('employees'),  { list: [] });
          await setDoc(base('holidays'),   { list: SEED_HOLIDAYS });
          await setDoc(base('attendance'), { map: {} });
          await setDoc(base('documents'),  { map: {} });
        }
      }

      onComplete({ firms, plan: 'trial', createdAt: now, orgName: orgName.trim(), industry, gst: gst.trim() });

      // Send welcome email — fire-and-forget, don't block the UI
      try {
        const sendWelcomeEmail = httpsCallable(getFunctions(), 'sendWelcomeEmail');
        await sendWelcomeEmail({ orgName: orgName.trim(), email: user.email, createdAt: now });
      } catch {
        // Email failure is non-fatal
      }
    } catch (err) {
      setError('Setup failed: ' + err.message);
    }

    setLoading(false);
  };

  const signOutBtn = (
    <div style={{ textAlign: 'center', marginTop: 20 }}>
      <button
        onClick={() => signOut(auth)}
        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
      >
        Sign out and use a different account
      </button>
    </div>
  );

  const brandHeader = (title, sub) => (
    <div style={{ textAlign: 'center', marginBottom: 40 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '0.2em', color: 'var(--accent)',
        textTransform: 'uppercase', marginBottom: 14,
      }}>
        <Zap size={13} /> PayrollSaaS
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, margin: 0, letterSpacing: '-0.01em' }}>
        {title}
      </h1>
      {sub && (
        <p style={{ color: 'var(--text-faint)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{sub}</p>
      )}
    </div>
  );

  const cardStyle = { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 };
  const wrap = (children) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        {children}
        {signOutBtn}
      </div>
    </div>
  );

  // ── Step indicator ──────────────────────────────────────────────────────────
  const StepBar = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
      {[1, 2, 3].map((s) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: step >= s ? 'var(--accent)' : 'var(--bg-2)',
            border: `2px solid ${step >= s ? 'var(--accent)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
            color: step >= s ? 'var(--bg)' : 'var(--text-faint)',
            transition: 'all 0.2s',
          }}>
            {s}
          </div>
          {s < 3 && <div style={{ width: 28, height: 1, background: step > s ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s' }} />}
        </div>
      ))}
    </div>
  );

  // ── Step 1: Organization details ────────────────────────────────────────────
  if (step === 1) return wrap(
    <>
      {brandHeader('Set up your workspace', `Signed in as ${user.email || user.displayName || 'you'}`)}
      <div style={cardStyle}>
        <StepBar />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Building2 size={16} style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Organization details</div>
        </div>
        <form onSubmit={goToFirmCount}>
          <div className="field">
            <label>Organization / Company name *</label>
            <input
              value={orgName}
              onChange={(e) => { setOrgName(e.target.value); setError(''); }}
              placeholder="e.g. Anushree Electrical Pvt. Ltd."
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Industry *</label>
            <select
              className="select"
              value={industry}
              onChange={(e) => { setIndustry(e.target.value); setError(''); }}
              required
              style={{ width: '100%' }}
            >
              <option value="">— Select industry —</option>
              {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>
          <div className="field">
            <label>GST Number <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(optional)</span></label>
            <input
              value={gst}
              onChange={(e) => setGst(e.target.value.toUpperCase())}
              placeholder="e.g. 09AABCU9603R1ZX"
              maxLength={15}
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(212,106,90,0.12)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14, marginTop: 4 }}
          >
            Continue →
          </button>
        </form>
      </div>
    </>
  );

  // ── Step 2: Choose number of firms ──────────────────────────────────────────
  if (step === 2) return wrap(
    <>
      {brandHeader('How many firms?', 'You can add more later from the dashboard.')}
      <div style={cardStyle}>
        <StepBar />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStep(1); setShowCustom(false); }}>
            <ChevronLeft size={14} /> Back
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
            {orgName}
          </span>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '0 0 20px', textAlign: 'center' }}>
          How many firms or branches do you manage?
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {COUNT_PRESETS.map((n) => (
            <button
              key={n}
              className="btn"
              onClick={() => goToNames(n)}
              style={{ justifyContent: 'center', flexDirection: 'column', gap: 4, padding: '14px 8px', height: 72 }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>{n}</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{n === 1 ? 'Firm' : 'Firms'}</span>
            </button>
          ))}
        </div>

        {!showCustom ? (
          <button
            className="btn btn-ghost"
            onClick={() => setShowCustom(true)}
            style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13 }}
          >
            5 or more firms…
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number" min={5} max={20}
              value={customCount}
              onChange={(e) => setCustomCount(Math.max(5, Math.min(20, Number(e.target.value))))}
              style={{ width: 72, textAlign: 'center' }}
            />
            <button
              className="btn btn-primary"
              onClick={() => goToNames(customCount)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Continue with {customCount} firms
            </button>
          </div>
        )}
      </div>
    </>
  );

  // ── Step 3: Name your firms ─────────────────────────────────────────────────
  return wrap(
    <>
      {brandHeader('Name your firms')}
      <div style={cardStyle}>
        <StepBar />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStep(2); setShowCustom(false); }}>
            <ChevronLeft size={14} /> Back
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
            {firmCount} {firmCount === 1 ? 'firm' : 'firms'}
          </span>
        </div>

        <form onSubmit={handleSetup}>
          {firmNames.map((name, i) => (
            <div key={i} className="field" style={{ marginBottom: 14 }}>
              <label>Firm {i + 1}{i === 0 ? ' (main company)' : ''}</label>
              <input
                value={name}
                onChange={(e) => updateName(i, e.target.value)}
                placeholder={i === 0 ? orgName || 'e.g. ABC Industries Pvt. Ltd.' : `Branch or subsidiary ${i + 1}`}
                required
                autoFocus={i === 0}
              />
            </div>
          ))}

          {error && (
            <div style={{ background: 'rgba(212,106,90,0.12)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ background: 'rgba(212,160,74,0.08)', border: '1px solid rgba(212,160,74,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.6 }}>
            🎉 <strong style={{ color: 'var(--accent)' }}>30-day free trial</strong> — all features unlocked, no credit card required. After your trial, choose from Starter, Pro, or Enterprise.
          </div>

          <button
            type="submit"
            disabled={loading || firmNames.some((n) => !n.trim())}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14, marginTop: 8, opacity: loading || firmNames.some((n) => !n.trim()) ? 0.7 : 1 }}
          >
            {loading ? 'Setting up…' : 'Start Free Trial'}
          </button>
        </form>
      </div>
    </>
  );
}
