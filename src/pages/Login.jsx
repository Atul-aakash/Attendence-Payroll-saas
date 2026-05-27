import { useState, useRef, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth } from '../firebase';
import { Zap } from 'lucide-react';

const googleProvider = new GoogleAuthProvider();

function friendlyError(err) {
  const code = err?.code ?? '';
  console.error('[Auth error]', code, err?.message);
  switch (code) {
    case 'auth/user-not-found':             return 'No account found with this email.';
    case 'auth/wrong-password':             return 'Incorrect password.';
    case 'auth/invalid-credential':         return 'Incorrect email or password.';
    case 'auth/email-already-in-use':       return 'An account with this email already exists.';
    case 'auth/weak-password':              return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':              return 'Please enter a valid email address.';
    case 'auth/too-many-requests':          return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':     return 'Network error. Check your internet connection and try again.';
    case 'auth/operation-not-allowed':      return 'This sign-in method is not enabled. Go to Firebase Console → Authentication → Sign-in method and enable it.';
    case 'auth/configuration-not-found':    return 'Firebase Authentication is not set up. Go to Firebase Console → Authentication → Get started.';
    case 'auth/invalid-api-key':            return 'Invalid Firebase config. Check your firebase.js settings.';
    case 'auth/invalid-phone-number':       return 'Invalid phone number. Enter a 10-digit Indian mobile number.';
    case 'auth/invalid-verification-code':  return 'Incorrect OTP. Please check and try again.';
    case 'auth/code-expired':               return 'OTP has expired. Go back and request a new one.';
    case 'auth/missing-phone-number':       return 'Please enter your phone number.';
    case 'auth/captcha-check-failed':       return 'reCAPTCHA check failed. Refresh the page and try again.';
    default:                                return `Error (${code || 'unknown'}): ${err?.message ?? 'Something went wrong. Please try again.'}`;
  }
}

// ── Small reusable error box ──────────────────────────────────────────────────
function ErrorBox({ msg }) {
  return (
    <div style={{
      background: 'rgba(212,106,90,0.12)',
      border: '1px solid var(--danger)',
      borderRadius: 8, padding: '10px 12px',
      fontSize: 13, color: 'var(--danger)',
      marginBottom: 16, lineHeight: 1.5,
    }}>
      {msg}
    </div>
  );
}

// ── Tab pill ──────────────────────────────────────────────────────────────────
function TabBar({ options, value, onChange }) {
  return (
    <div style={{
      display: 'flex', background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 10, padding: 4, marginBottom: 20,
    }}>
      {options.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          style={{
            flex: 1, padding: '8px 0',
            borderRadius: 7, border: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: 13, fontWeight: 500,
            cursor: 'pointer',
            background: value === id ? 'var(--bg-3)' : 'transparent',
            color:      value === id ? 'var(--text)' : 'var(--text-dim)',
            transition: 'all 0.15s',
            boxShadow:  value === id ? 'inset 0 0 0 1px var(--border-2)' : 'none',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Google button ─────────────────────────────────────────────────────────────
function GoogleButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '11px 16px',
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 10, color: 'var(--text)',
        fontSize: 14, fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s',
        fontFamily: 'var(--font-body)', marginBottom: 20,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google
    </button>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>or</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

// ── Main Login component ──────────────────────────────────────────────────────
export default function Login({ accessDeniedError }) {
  // Which auth method is shown: 'email' | 'phone'
  const [method,    setMethod]    = useState('email');
  // Sub-mode for email: 'signin' | 'signup'
  const [emailMode, setEmailMode] = useState('signin');
  // Phone flow step: 'input' | 'otp'
  const [phoneStep, setPhoneStep] = useState('input');

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [phone,      setPhone]      = useState('');   // 10 digits only, +91 prepended on send
  const [otp,        setOtp]        = useState('');
  const [showReset,  setShowReset]  = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent,  setResetSent]  = useState(false);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Holds the Firebase confirmation result between Step 1 and Step 2
  const confirmationRef = useRef(null);
  // Holds the RecaptchaVerifier instance so we can clear it on error/unmount
  const recaptchaRef    = useRef(null);

  // Clean up reCAPTCHA when component unmounts
  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  const clearError = () => setError('');

  const switchMethod = (m) => {
    setMethod(m);
    setPhoneStep('input');
    setOtp('');
    confirmationRef.current = null;
    clearError();
  };

  // ── Google ──────────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    clearError();
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') setError(friendlyError(err));
    }
    setLoading(false);
  };

  // ── Email / Password ────────────────────────────────────────────────────────
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      if (emailMode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        // Send verification email; App.jsx will show the verification screen
        await sendEmailVerification(user);
      }
    } catch (err) {
      setError(friendlyError(err));
    }
    setLoading(false);
  };

  // ── Forgot Password ─────────────────────────────────────────────────────────
  const handlePasswordReset = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(friendlyError(err));
    }
    setLoading(false);
  };

  // ── Phone Step 1: Send OTP ──────────────────────────────────────────────────
  const sendOTP = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      // Always destroy the old instance + wipe DOM node before creating a new one.
      // Without the innerHTML clear, Firebase throws "reCAPTCHA already rendered"
      // even after calling .clear() on the JS object.
      if (recaptchaRef.current) {
        recaptchaRef.current.clear();
        recaptchaRef.current = null;
      }
      const container = document.getElementById('recaptcha-container');
      if (container) container.innerHTML = '';

      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
      const fullNumber = `+91${phone}`;
      const result = await signInWithPhoneNumber(auth, fullNumber, recaptchaRef.current);
      confirmationRef.current = result;
      setPhoneStep('otp');
    } catch (err) {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
      const container = document.getElementById('recaptcha-container');
      if (container) container.innerHTML = '';
      setError(friendlyError(err));
    }
    setLoading(false);
  };

  // ── Phone Step 2: Verify OTP ────────────────────────────────────────────────
  const verifyOTP = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      await confirmationRef.current.confirm(otp);
      // onAuthStateChanged in App.jsx takes it from here
    } catch (err) {
      setError(friendlyError(err));
    }
    setLoading(false);
  };

  // Reset phone flow so user can try a different number
  const resetPhone = () => {
    setPhoneStep('input');
    setOtp('');
    clearError();
    confirmationRef.current = null;
    if (recaptchaRef.current) {
      recaptchaRef.current.clear();
      recaptchaRef.current = null;
    }
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';
  };

  // ── Decide header text ──────────────────────────────────────────────────────
  const isOtpStep   = method === 'phone' && phoneStep === 'otp';
  const headerTitle = isOtpStep ? 'Enter OTP' : 'Welcome';
  const headerSub   = isOtpStep
    ? `OTP sent to +91 ${phone}. Check your messages.`
    : 'Sign in to access your payroll dashboard.';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--bg)',
    }}>
      {/* Invisible reCAPTCHA mount point — must be in the DOM */}
      <div id="recaptcha-container" style={{ display: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* ── Brand header ── */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.2em', color: 'var(--accent)',
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            <Zap size={13} /> PayrollSaaS
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30, fontWeight: 500, margin: 0,
            letterSpacing: '-0.015em', color: 'var(--text)',
          }}>
            {headerTitle}
          </h1>
          <p style={{ color: 'var(--text-faint)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            {headerSub}
          </p>
        </div>

        {/* ── Card ── */}
        <div style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 16, padding: 32,
        }}>

          {/* Access denied banner */}
          {accessDeniedError && !isOtpStep && (
            <div style={{
              background: 'rgba(212,106,90,0.12)',
              border: '1px solid var(--danger)',
              borderRadius: 8, padding: '10px 12px',
              fontSize: 13, color: 'var(--danger)',
              marginBottom: 20, lineHeight: 1.5,
            }}>
              {accessDeniedError}
            </div>
          )}

          {/* Google + method selector — hidden on OTP step */}
          {!isOtpStep && (
            <>
              <GoogleButton onClick={handleGoogle} disabled={loading} />
              <Divider />
              <TabBar
                options={[{ id: 'email', label: 'Email' }, { id: 'phone', label: 'Phone' }]}
                value={method}
                onChange={switchMethod}
              />
            </>
          )}

          {/* ════ EMAIL METHOD ════════════════════════════════════════════════ */}
          {method === 'email' && !showReset && (
            <>
              <TabBar
                options={[{ id: 'signin', label: 'Sign In' }, { id: 'signup', label: 'Sign Up' }]}
                value={emailMode}
                onChange={(m) => { setEmailMode(m); clearError(); }}
              />
              <form onSubmit={handleEmailAuth}>
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoFocus
                  />
                </div>
                <div className="field" style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <label>Password</label>
                    {emailMode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => { setShowReset(true); setResetEmail(email); setResetSent(false); clearError(); }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)' }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={emailMode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                    required
                    minLength={6}
                    style={{ marginTop: 6, marginBottom: error ? 0 : 14 }}
                  />
                </div>

                {error && <ErrorBox msg={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14, opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Please wait…' : emailMode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </form>
            </>
          )}

          {/* ════ FORGOT PASSWORD ════════════════════════════════════════════ */}
          {method === 'email' && showReset && (
            <>
              {resetSent ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 8 }}>Reset email sent!</div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
                    Check <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{resetEmail}</span> for a password reset link.
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowReset(false); setResetSent(false); clearError(); }}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14 }}
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordReset}>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.6 }}>
                    Enter your email and we'll send you a link to reset your password.
                  </div>
                  <div className="field" style={{ marginBottom: error ? 12 : 20 }}>
                    <label>Email</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => { setResetEmail(e.target.value); clearError(); }}
                      placeholder="you@company.com"
                      required
                      autoFocus
                    />
                  </div>

                  {error && <ErrorBox msg={error} />}

                  <button
                    type="submit"
                    disabled={loading || !resetEmail}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14, opacity: (loading || !resetEmail) ? 0.7 : 1, marginBottom: 12 }}
                  >
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReset(false); clearError(); }}
                    style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer', padding: '6px 0', fontFamily: 'var(--font-body)' }}
                  >
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </>
          )}

          {/* ════ PHONE METHOD — Step 1: enter number ════════════════════════ */}
          {method === 'phone' && phoneStep === 'input' && (
            <form onSubmit={sendOTP}>
              <div className="field">
                <label>Mobile number</label>
                {/* +91 prefix + 10-digit input */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{
                    display: 'flex', alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, fontFamily: 'var(--font-mono)',
                    fontSize: 13, color: 'var(--text-dim)',
                    flexShrink: 0, userSelect: 'none',
                  }}>
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhone(digits);
                      clearError();
                    }}
                    placeholder="9999 999 999"
                    required
                    pattern="\d{10}"
                    autoFocus
                    style={{ flex: 1, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 5 }}>
                  Enter 10-digit Indian mobile number. An OTP will be sent via SMS.
                </div>
              </div>

              {error && <ErrorBox msg={error} />}

              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="btn btn-primary"
                style={{
                  width: '100%', justifyContent: 'center',
                  padding: '11px 16px', fontSize: 14,
                  opacity: (loading || phone.length !== 10) ? 0.7 : 1,
                }}
              >
                {loading ? 'Sending OTP…' : 'Send OTP via SMS'}
              </button>
            </form>
          )}

          {/* ════ PHONE METHOD — Step 2: enter OTP ══════════════════════════ */}
          {method === 'phone' && phoneStep === 'otp' && (
            <form onSubmit={verifyOTP}>
              <div style={{
                fontSize: 13, color: 'var(--text-dim)',
                background: 'var(--bg-2)',
                borderLeft: '2px solid var(--accent)',
                padding: '10px 14px', borderRadius: '0 8px 8px 0',
                marginBottom: 20, lineHeight: 1.6,
              }}>
                OTP sent to{' '}
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                  +91 {phone}
                </span>
                . Check your SMS inbox.
              </div>

              <div className="field" style={{ marginBottom: error ? 12 : 20 }}>
                <label>One-time password (OTP)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtp(digits);
                    clearError();
                  }}
                  placeholder="• • • • • •"
                  required
                  pattern="\d{6}"
                  autoFocus
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 22, letterSpacing: '0.35em',
                    textAlign: 'center',
                  }}
                />
              </div>

              {error && <ErrorBox msg={error} />}

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="btn btn-primary"
                style={{
                  width: '100%', justifyContent: 'center',
                  padding: '11px 16px', fontSize: 14,
                  opacity: (loading || otp.length !== 6) ? 0.7 : 1,
                  marginBottom: 12,
                }}
              >
                {loading ? 'Verifying…' : 'Verify & Sign In'}
              </button>

              <button
                type="button"
                onClick={resetPhone}
                style={{
                  width: '100%', background: 'none', border: 'none',
                  color: 'var(--text-faint)', fontSize: 12,
                  cursor: 'pointer', padding: '6px 0',
                  fontFamily: 'var(--font-body)',
                }}
              >
                ← Use a different number
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', marginTop: 20 }}>
          Your data is private and stored securely in Firebase.
        </p>
      </div>
    </div>
  );
}
