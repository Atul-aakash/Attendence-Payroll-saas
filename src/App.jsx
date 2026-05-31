import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, CalendarCheck, Users, CalendarRange, Layers,
  Download, Upload, ChevronLeft, ChevronRight, Zap, LogOut,
  Camera, Pencil, Trash2, Loader2, Plus, FileSpreadsheet, FileText, FolderOpen, UserCog, CreditCard,
  RefreshCw, Mail, Sparkles, AlarmClock, X as XIcon,
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, sendEmailVerification } from 'firebase/auth';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import { db, auth, storage } from './firebase';
import { MONTH_NAMES, computeMonthPayroll, AEEPL_DIVISOR, monthKey } from './payroll';
import Overview          from './pages/Overview';
import Attendance        from './pages/Attendance';
import Employees         from './pages/Employees';
import Holidays          from './pages/Holidays';
import PayrollComponents from './pages/PayrollComponents';
import EmpDocs           from './pages/EmpDocs';
import AtlashAI          from './pages/AtlashAI';
import Login             from './pages/Login';
import CompanySetup      from './pages/CompanySetup';
import UserManagement    from './pages/UserManagement';
import Billing           from './pages/Billing';
import { AppProvider, useApp } from './context/AppContext';
import { canAddFirm, getUpgradeMessage, getTrialDaysLeft, isTrialExpired } from './lib/planLimits';

const UI_KEY = 'payroll-ui';
function loadUI() {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; }
}

// Super-admin UID — set via VITE_SUPER_ADMIN_UID env var
const SUPER_ADMIN_UID = import.meta.env.VITE_SUPER_ADMIN_UID || '';

function normalizeFirms(profile) {
  if (!profile) return [];
  if (profile.firms) return profile.firms;
  if (profile.companyId && profile.companyName) {
    return [{ id: profile.companyId, name: profile.companyName }];
  }
  return [];
}

// ── Spinner ────────────────────────────────────────────────────────────────────
const Spinner = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, color: 'var(--text-faint)' }}>
    <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    {label && <span style={{ fontSize: 13 }}>{label}</span>}
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ── Email verification wall ────────────────────────────────────────────────────
function VerifyEmailScreen({ user }) {
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const resend = async () => {
    setLoading(true);
    setError('');
    try {
      await sendEmailVerification(user);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 28 }}>
          <Zap size={13} /> PayrollSaaS
        </div>
        <div style={{ fontSize: 44, marginBottom: 16 }}>📬</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, margin: '0 0 12px', letterSpacing: '-0.01em' }}>
          Verify your email
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
          We sent a verification link to<br />
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13 }}>{user.email}</span>.<br />
          Click the link to activate your account.
        </p>

        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
          {sent ? (
            <p style={{ fontSize: 13, color: '#64c878', margin: 0 }}>✓ Verification email resent. Check your inbox (and spam folder).</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 16 }}>Didn't receive it? Check your spam folder or resend below.</p>
              {error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
              <button
                className="btn btn-primary"
                onClick={resend}
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Sending…</> : <><RefreshCw size={14} /> Resend verification email</>}
              </button>
            </>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 8 }}>
            Once verified, refresh this page to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-ghost"
            style={{ marginRight: 10 }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            onClick={() => signOut(auth)}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ambient background ─────────────────────────────────────────────────────────
function BackgroundFX() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let w = 0, h = 0, t = 0;
    const waves = [
      { amp: 55, freq: 0.0055, speed: 0.25,  phase: 0.0, yRatio: 0.27, color: '#d4a04a', opacity: 0.05, lw: 1.5 },
      { amp: 38, freq: 0.0085, speed: -0.18, phase: 2.1, yRatio: 0.56, color: '#6a9ad4', opacity: 0.04, lw: 1.0 },
      { amp: 70, freq: 0.004,  speed: 0.12,  phase: 4.8, yRatio: 0.82, color: '#8a6a30', opacity: 0.03, lw: 1.5 },
    ];
    let dots = [];
    const initDots = () => {
      dots = Array.from({ length: 15 }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        radius: 1.5 + Math.random() * 2,
        color: Math.random() > 0.35 ? '#d4a04a' : '#6a9ad4',
        opacity: 0.22 + Math.random() * 0.28,
      }));
    };
    const resize = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
      if (dots.length === 0) initDots();
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      waves.forEach((wave) => {
        ctx.save(); ctx.globalAlpha = wave.opacity; ctx.strokeStyle = wave.color; ctx.lineWidth = wave.lw;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const y = h * wave.yRatio + Math.sin(x * wave.freq + t * wave.speed + wave.phase) * wave.amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.restore();
      });
      dots.forEach((dot) => {
        ctx.save(); ctx.globalAlpha = dot.opacity * 0.25; ctx.fillStyle = dot.color;
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.radius * 4.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.save(); ctx.globalAlpha = dot.opacity; ctx.shadowColor = dot.color; ctx.shadowBlur = 12; ctx.fillStyle = dot.color;
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        dot.x += dot.vx; dot.y += dot.vy;
        if (dot.x < -12) dot.x = w + 12; if (dot.x > w + 12) dot.x = -12;
        if (dot.y < -12) dot.y = h + 12; if (dot.y > h + 12) dot.y = -12;
      });
      t += 1; animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return (
    <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 0 }} />
  );
}

// ── Firm picker (multi-select) ─────────────────────────────────────────────────
function FirmPicker({ firmOptions }) {
  const { selectedFirms, setSelectedFirms, toggleFirm } = useApp();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const label = selectedFirms.length === 0 ? 'All Firms' : selectedFirms.length === 1 ? selectedFirms[0] : `${selectedFirms.length} Firms`;
  return (
    <div ref={pickerRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        {label} <span style={{ fontSize: 9, opacity: 0.6, lineHeight: 1 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 10, minWidth: 220, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 200, padding: '6px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
            <input type="checkbox" checked={selectedFirms.length === 0} onChange={() => setSelectedFirms([])} style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: selectedFirms.length === 0 ? 600 : 400, color: selectedFirms.length === 0 ? 'var(--text)' : 'var(--text-dim)' }}>All Firms</span>
          </label>
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 12px 4px' }} />
          {firmOptions.map((name) => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
              <input type="checkbox" checked={selectedFirms.includes(name)} onChange={() => toggleFirm(name)} style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: selectedFirms.includes(name) ? 'var(--text)' : 'var(--text-dim)', fontWeight: selectedFirms.includes(name) ? 500 : 400 }}>{name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Avatar crop modal ──────────────────────────────────────────────────────────
function AvatarCropModal({ src, onApply, onCancel }) {
  const SIZE = 260, OUTPUT = 300;
  const imgElRef = useRef(null), dragging = useRef(false), dragStart = useRef({ x: 0, y: 0 }), dragBase = useRef({ x: 0, y: 0 });
  const [imgReady, setImgReady] = useState(false);
  const [natSize,  setNatSize]  = useState({ w: 0, h: 0 });
  const [scale,    setScale]    = useState(1);
  const [offset,   setOffset]   = useState({ x: 0, y: 0 });
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgElRef.current = img;
      const init = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
      setNatSize({ w: img.naturalWidth, h: img.naturalHeight });
      setScale(init); setOffset({ x: 0, y: 0 }); setImgReady(true);
    };
    img.src = src;
  }, [src]);
  const minScale = natSize.w > 0 ? Math.max(SIZE / natSize.w, SIZE / natSize.h) : 0.5;
  const scaledW = natSize.w * scale, scaledH = natSize.h * scale;
  const onPointerDown = (e) => { dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY }; dragBase.current = { ...offset }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); };
  const onPointerMove = (e) => { if (!dragging.current) return; setOffset({ x: dragBase.current.x + e.clientX - dragStart.current.x, y: dragBase.current.y + e.clientY - dragStart.current.y }); };
  const onPointerUp = () => { dragging.current = false; };
  const handleApply = () => {
    const img = imgElRef.current; if (!img) return;
    const canvas = document.createElement('canvas'); canvas.width = OUTPUT; canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2); ctx.clip();
    const imgLeft = (SIZE - scaledW) / 2 + offset.x, imgTop = (SIZE - scaledH) / 2 + offset.y;
    ctx.drawImage(img, -imgLeft / scale, -imgTop / scale, SIZE / scale, SIZE / scale, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => onApply(blob), 'image/jpeg', 0.92);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div style={{ background: 'var(--bg-1)', borderRadius: 18, padding: '26px 30px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, minWidth: 330 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Adjust Profile Photo</div>
        <div style={{ width: SIZE, height: SIZE, borderRadius: '50%', overflow: 'hidden', position: 'relative', cursor: 'grab', border: '3px solid var(--accent)', background: 'var(--bg-2)', flexShrink: 0, touchAction: 'none' }} onPointerDown={onPointerDown}>
          {imgReady && <img src={src} draggable={false} style={{ position: 'absolute', width: scaledW, height: scaledH, left: (SIZE - scaledW) / 2 + offset.x, top: (SIZE - scaledH) / 2 + offset.y, pointerEvents: 'none', userSelect: 'none' }} />}
        </div>
        <div style={{ width: SIZE, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>Zoom</span>
          <input type="range" min={minScale} max={minScale * 4} step={0.005} value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
          <button onClick={handleApply} style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: 'var(--accent)', border: 'none', color: 'var(--bg)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ── Profile dropdown ───────────────────────────────────────────────────────────
function ProfileDropdown({ firms, firebaseUser, userProfile, updateFirms, updateAvatar, userRole, isOwnerUser, plan, onManageUsers, onBilling }) {
  const { selectedFirms, setSelectedFirms, toggleFirm } = useApp();
  const [open,          setOpen]         = useState(false);
  const [editingId,     setEditingId]    = useState(null);
  const [editingName,   setEditingName]  = useState('');
  const [savingFirm,    setSavingFirm]   = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [addingFirm,    setAddingFirm]   = useState(false);
  const [newFirmName,   setNewFirmName]  = useState('');
  const [previewSrc,    setPreviewSrc]   = useState(null);
  const dropdownRef = useRef(null), avatarInput = useRef(null);

  const avatarUrl   = userProfile?.avatarUrl ?? null;
  const displayName = firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || 'User';
  const initials    = displayName.split(/[\s.@]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const startEdit = (firm) => { setEditingId(firm.id); setEditingName(firm.name); };
  const saveEdit  = async () => {
    if (!editingName.trim() || !editingId) return;
    setSavingFirm(true);
    await updateFirms(firms.map((f) => f.id === editingId ? { ...f, name: editingName.trim() } : f));
    setSavingFirm(false); setEditingId(null);
  };
  const deleteFirm = async (firmId) => {
    if (firms.length <= 1) { alert('You must keep at least one firm.'); return; }
    if (!confirm('Delete this firm? Its employee data stays in the database but won\'t be visible.')) return;
    const deleted = firms.find((f) => f.id === firmId);
    await updateFirms(firms.filter((f) => f.id !== firmId));
    if (deleted) setSelectedFirms((prev) => prev.filter((n) => n !== deleted.name));
  };
  const addFirm = async () => {
    const name = newFirmName.trim(); if (!name) return;
    if (!canAddFirm(plan, firms.length)) {
      alert(getUpgradeMessage(plan, 'firms'));
      return;
    }
    const newFirm = { id: `${firebaseUser.uid}_${Date.now()}`, name };
    await updateFirms([...firms, newFirm]);
    setNewFirmName(''); setAddingFirm(false);
  };
  const handleLogoChange = (e) => { const file = e.target.files?.[0]; if (!file) return; setPreviewSrc(URL.createObjectURL(file)); e.target.value = ''; };
  const handleApplyLogo  = async (blob) => {
    setPreviewSrc(null); setUploadingLogo(true);
    try {
      const fileRef = sRef(storage, `avatars/${firebaseUser.uid}`);
      await uploadBytes(fileRef, blob);
      const url = await getDownloadURL(fileRef);
      await updateAvatar(url);
    } catch (err) { alert('Upload failed: ' + err.message); }
    setUploadingLogo(false);
  };

  const ROW = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 16px', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s, color 0.15s' };
  const ICON_BTN = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '3px 4px', display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color 0.15s', flexShrink: 0 };

  return (
    <>
      {previewSrc && <AvatarCropModal src={previewSrc} onApply={handleApplyLogo} onCancel={() => { URL.revokeObjectURL(previewSrc); setPreviewSrc(null); }} />}
      <div ref={dropdownRef} style={{ position: 'relative', borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
        <button title="Profile" onClick={() => setOpen((o) => !o)} style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, border: `2px solid ${open ? 'var(--accent)' : 'var(--border-2)'}`, background: avatarUrl ? 'transparent' : 'var(--accent-dim)', cursor: 'pointer', padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.2s' }}>
          {avatarUrl ? <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bg)', fontFamily: 'var(--font-mono)', letterSpacing: 0 }}>{initials}</span>}
        </button>

        {open && (
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 12, minWidth: 260, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden' }}>
            {/* User info */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{firebaseUser?.email}</div>
              {plan && plan !== 'free' && (
                <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(212,160,74,0.18)', color: 'var(--accent)', border: '1px solid rgba(212,160,74,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {plan}
                </div>
              )}
            </div>

            {/* Edit logo */}
            <div style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <button style={ROW} onClick={() => avatarInput.current?.click()} disabled={uploadingLogo}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                {uploadingLogo ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent)' }} /> : <Camera size={14} style={{ color: 'var(--accent)' }} />}
                {uploadingLogo ? 'Uploading…' : 'Edit Profile Logo'}
              </button>
              <input ref={avatarInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
            </div>

            {/* Firms list */}
            {isOwnerUser && (
              <div style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '7px 16px 3px', fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Firms</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                  <input type="checkbox" checked={selectedFirms.length === 0} onChange={() => setSelectedFirms([])} style={{ accentColor: 'var(--accent)', width: 13, height: 13, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: selectedFirms.length === 0 ? 'var(--text)' : 'var(--text-dim)', fontWeight: selectedFirms.length === 0 ? 600 : 400 }}>All Firms</span>
                </label>
                {firms.map((firm) => (
                  <div key={firm.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px' }}>
                    <input type="checkbox" checked={selectedFirms.includes(firm.name)} onChange={() => toggleFirm(firm.name)} style={{ accentColor: 'var(--accent)', width: 13, height: 13, flexShrink: 0 }} />
                    {editingId === firm.id ? (
                      <input value={editingName} autoFocus onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        onBlur={saveEdit} disabled={savingFirm}
                        style={{ flex: 1, fontSize: 13, padding: '3px 7px', background: 'var(--bg-2)', border: '1px solid var(--accent)', borderRadius: 5, color: 'var(--text)', outline: 'none' }} />
                    ) : (
                      <span onClick={() => toggleFirm(firm.name)} style={{ flex: 1, fontSize: 13, cursor: 'pointer', color: selectedFirms.includes(firm.name) ? 'var(--text)' : 'var(--text-dim)', fontWeight: selectedFirms.includes(firm.name) ? 500 : 400 }}>{firm.name}</span>
                    )}
                    <button style={ICON_BTN} title="Rename firm" onClick={() => editingId === firm.id ? saveEdit() : startEdit(firm)}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-faint)'}>
                      <Pencil size={12} />
                    </button>
                    <button style={ICON_BTN} title="Delete firm" onClick={() => deleteFirm(firm.id)}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-faint)'}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <div style={{ padding: '4px 16px 8px' }}>
                  {addingFirm ? (
                    <div>
                      <input autoFocus value={newFirmName} onChange={(e) => setNewFirmName(e.target.value)} placeholder="New firm name"
                        onKeyDown={(e) => { if (e.key === 'Enter') addFirm(); if (e.key === 'Escape') { setAddingFirm(false); setNewFirmName(''); } }}
                        style={{ width: '100%', fontSize: 13, padding: '5px 8px', background: 'var(--bg-2)', border: '1px solid var(--accent)', borderRadius: 5, color: 'var(--text)', outline: 'none', marginBottom: 6 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={addFirm} style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>Add</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => { setAddingFirm(false); setNewFirmName(''); }} style={{ fontSize: 12 }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button style={{ ...ROW, padding: '6px 0', color: 'var(--accent)', fontSize: 12 }} onClick={() => setAddingFirm(true)}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}>
                      <Plus size={13} /> Add Firm
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Billing — owner only */}
            {isOwnerUser && (
              <div style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <button style={ROW} onClick={() => { setOpen(false); onBilling(); }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                  <CreditCard size={14} style={{ color: 'var(--accent)' }} /> Billing & Plan
                </button>
              </div>
            )}

            {/* Manage Users — admin role */}
            {userRole === 'admin' && (
              <div style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <button style={ROW} onClick={() => { setOpen(false); onManageUsers(); }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                  <UserCog size={14} style={{ color: 'var(--accent)' }} /> Manage Users
                </button>
              </div>
            )}

            {/* Sign out */}
            <div style={{ padding: '4px 0' }}>
              <button style={{ ...ROW, color: 'var(--danger)' }} onClick={() => signOut(auth)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,106,90,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────────
const calcFirmTotals = (rows) =>
  rows.reduce((a, r) => {
    a.gross += r.grossAfterAbsent; a.esi += r.esiDeduct; a.employerEsi += r.employerEsi;
    a.bonus += r.bonus; a.net += r.netPayable; a.absent += r.daysAbsent;
    return a;
  }, { gross: 0, esi: 0, employerEsi: 0, bonus: 0, net: 0, absent: 0 });

// ── Social media icons ────────────────────────────────────────────────────────
const FacebookIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
);
const InstagramIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
);
const TwitterIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
);
const RedditIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><g fill="white"><circle cx="15.5" cy="11.5" r="1"/><circle cx="8.5" cy="11.5" r="1"/><path d="M15 14.5s-.75 1.5-3 1.5-3-1.5-3-1.5"/><path d="M20 12a2 2 0 0 0-2-2 1.93 1.93 0 0 0-1.29.48A9.47 9.47 0 0 0 12.5 9.5v-.12l2.31-.46A1.5 1.5 0 0 0 16.5 10a1.5 1.5 0 1 0-2.58-1.03L11.27 9.5A.4.4 0 0 0 11 9.91l.11 1.85a9.39 9.39 0 0 0-4.77 1.44A1.93 1.93 0 0 0 5 12a2 2 0 0 0 1.3 1.87 3.5 3.5 0 0 0 .2 1.13C7.5 16.5 9.5 17.5 12 17.5s4.5-1 5.5-2.5a3.5 3.5 0 0 0 .2-1.13A2 2 0 0 0 20 12z"/></g></svg>
);
const WhatsAppIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
);

// ── WhatsApp contact modal ─────────────────────────────────────────────────────
// Update WHATSAPP_NUMBER to your business WhatsApp number (include country code, no +)
const WHATSAPP_NUMBER = '91XXXXXXXXXX';

function WhatsAppContactModal({ onClose }) {
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = encodeURIComponent(`Hi! I'm ${name}${phone ? ` (${phone})` : ''}.\n\n${message}`);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank');
    onClose();
  };

  const FIELD = { width: '100%', padding: '9px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 18, padding: '28px 32px', maxWidth: 400, width: '100%', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, display: 'flex', alignItems: 'center' }}>
          <XIcon size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#fff' }}><WhatsAppIcon /></span>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>Contact via WhatsApp</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>We'll reply as soon as possible</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginBottom: 5 }}>Your Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Enter your name" style={FIELD}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--border)'; }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginBottom: 5 }}>Phone Number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your contact number" style={FIELD}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--border)'; }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginBottom: 5 }}>Message *</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="How can we help you?" rows={4} style={{ ...FIELD, resize: 'vertical' }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--border)'; }} />
          </div>
          <button type="submit" style={{ background: '#25D366', border: 'none', color: '#fff', padding: '12px 16px', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <WhatsAppIcon /> Open WhatsApp Chat
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Welcome trial modal ────────────────────────────────────────────────────────
function WelcomeTrialModal({ orgName, trialEndDate, onClose }) {
  const features = [
    'Unlimited employees & firms',
    'Live payroll — ESI, PF, Bonus, Attendance',
    'Excel & PDF exports for every report',
    'Employee documents vault',
    'Invite team members',
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg-1)', border: '1px solid rgba(212,160,74,0.35)', borderRadius: 18, padding: '36px 36px 28px', maxWidth: 460, width: '100%', position: 'relative', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, display: 'flex', alignItems: 'center' }}>
          <XIcon size={16} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 52, marginBottom: 12, lineHeight: 1 }}>🎉</div>
          <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            Your 30-day free trial has started!
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-dim)' }}>
            {orgName && <><strong style={{ color: 'var(--text)' }}>{orgName}</strong> — all</>} features unlocked, no credit card required.
          </p>
        </div>

        {/* Trial end date */}
        <div style={{ background: 'rgba(212,160,74,0.09)', border: '1px solid rgba(212,160,74,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
            <AlarmClock size={14} style={{ color: 'var(--accent)' }} />
            Trial active until
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{trialEndDate}</span>
        </div>

        {/* Feature list */}
        <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0 }}>
          {features.map((f) => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', fontSize: 13, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              <Sparkles size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} /> {f}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          className="btn btn-primary"
          onClick={onClose}
          style={{ width: '100%', justifyContent: 'center', padding: '13px 16px', fontSize: 15, fontWeight: 700 }}
        >
          Start Exploring →
        </button>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', marginTop: 10, marginBottom: 0 }}>
          After your trial, choose from Starter (₹30), Pro (₹40), or Enterprise (₹79) — per employee/month.
        </p>
      </div>
    </div>
  );
}

// ── Inner dashboard ────────────────────────────────────────────────────────────
function AppDashboard({ firms, activeFirmId, switchFirm, firebaseUser, userProfile, updateFirms, updateAvatar, userRole, isOwnerUser, plan, ownerUid }) {
  const {
    employees, holidays, attendance, components,
    year, monthIdx, setYear, setMonthIdx, shiftMonth,
    setEmployees, setHolidays, setAttendance,
    companyName, companyId, loading, selectedFirms,
  } = useApp();

  const [showUserMgmt,  setShowUserMgmt]  = useState(false);
  const [showBilling,   setShowBilling]   = useState(false);
  const [showWAContact, setShowWAContact] = useState(false);

  const trialDaysLeft  = plan === 'trial' ? getTrialDaysLeft(userProfile?.createdAt) : null;
  const trialExpired   = isTrialExpired(plan, userProfile?.createdAt);
  const trialUrgency   = trialExpired ? 'expired' : trialDaysLeft <= 3 ? 'critical' : trialDaysLeft <= 7 ? 'warning' : 'normal';

  // Welcome modal — shown once per user per browser
  const welcomeKey     = `payroll_trial_welcome_${firebaseUser?.uid}`;
  const [showWelcome, setShowWelcome] = useState(
    () => plan === 'trial' && !localStorage.getItem(welcomeKey),
  );
  const dismissWelcome = () => {
    localStorage.setItem(welcomeKey, '1');
    setShowWelcome(false);
  };

  // Trial end date string for the welcome modal
  const trialEndDate = userProfile?.createdAt
    ? new Date(new Date(userProfile.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // Auto-open billing when trial expires so user must choose a plan
  useEffect(() => {
    if (trialExpired) setShowBilling(true);
  }, [trialExpired]);

  // Trigger server-side reminder email when within the 7-day window (idempotent)
  useEffect(() => {
    if (plan !== 'trial' || trialExpired || trialDaysLeft === null) return;
    if (trialDaysLeft > 7) return;
    const remKey = `payroll_reminder_triggered_${firebaseUser?.uid}`;
    if (localStorage.getItem(remKey)) return; // already triggered this session
    localStorage.setItem(remKey, '1');
    try {
      const fn = httpsCallable(getFunctions(), 'sendTrialReminderIfNeeded');
      fn().catch(() => {}); // fire-and-forget
    } catch { /* email failure is non-fatal */ }
  }, [plan, trialDaysLeft, trialExpired, firebaseUser?.uid]);

  const firmOptions = [...new Set([
    ...(firms || []).map((f) => f.name),
    ...(employees || []).map((e) => e.firm).filter(Boolean),
  ])];

  const [tab, setTab] = useState('overview');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const fileInput = useRef(null);

  if (loading) return <Spinner label={`Loading ${companyName}…`} />;

  // ── Excel export (unchanged logic) ──────────────────────────────────────────
  const exportExcel = () => {
    const wb   = XLSX.utils.book_new();
    const slug = companyName.replace(/[^a-z0-9]/gi, '_').slice(0, 18);
    if (tab === 'overview') {
      const summary = computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components });
      const sheet = [
        [`${companyName} — ${MONTH_NAMES[monthIdx]} ${year} Payroll Summary`], [],
        ['Metric', 'Value'],
        ['Total Employees', summary.headcount], ['Public Holidays', summary.publicHolidays],
        ['Total Days in Month', summary.totalDays],
        ['Gross Salary (₹)', Number(summary.totals.gross.toFixed(2))],
        ['Employee ESI Deducted (₹)', Number(summary.totals.esiDeduct.toFixed(2))],
        ['Employer ESI (₹)', Number(summary.totals.employerEsi.toFixed(2))],
        ['PF Deducted (₹)', Number(summary.totals.pfDeduct.toFixed(2))],
        ['Bonus (₹)', Number(summary.totals.bonus.toFixed(2))],
        ['Net Payable (₹)', Number(summary.totals.netPayable.toFixed(2))],
        [], ['Firm Breakdown'],
        ['Firm', 'Head-count', 'Gross (₹)', 'Employee ESI (₹)', 'Employer ESI (₹)', 'PF (₹)', 'Bonus (₹)', 'Net Payable (₹)'],
        ...summary.firmBreakdown.map((f) => [f.firm, f.headcount, Number(f.gross.toFixed(2)), Number(f.esiDeduct.toFixed(2)), Number(f.employerEsi.toFixed(2)), Number(f.pfDeduct.toFixed(2)), Number(f.bonus.toFixed(2)), Number(f.netPayable.toFixed(2))]),
        ['GRAND TOTAL', summary.headcount, Number(summary.totals.gross.toFixed(2)), Number(summary.totals.esiDeduct.toFixed(2)), Number(summary.totals.employerEsi.toFixed(2)), Number(summary.totals.pfDeduct.toFixed(2)), Number(summary.totals.bonus.toFixed(2)), Number(summary.totals.netPayable.toFixed(2))],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), 'Overview');
      XLSX.writeFile(wb, `${slug}_Overview_${MONTH_NAMES[monthIdx]}_${year}.xlsx`);
    } else if (tab === 'attendance') {
      const summary = computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components });
      const visibleFirms = selectedFirms.length === 0 ? [...new Set(employees.map((e) => e.firm))] : selectedFirms;
      const aoa = [];
      aoa.push([`Attendance Sheet - ${MONTH_NAMES[monthIdx]} ${year}`]);
      aoa.push([`26-Day Policy | Amounts in INR | Exported: ${new Date().toLocaleDateString('en-IN')}`]);
      aoa.push([]);
      visibleFirms.forEach((firm) => {
        const rows = summary.rows.filter((r) => r.employee.firm === firm);
        const ft   = calcFirmTotals(rows);
        const attMKey = monthKey(year, monthIdx);
        aoa.push([`Firm: ${firm}`]);
        aoa.push(['#', 'Employee', 'Guardian', 'Gross Salary', 'Per-day', 'Days Present', 'Absent', 'Paid Leaves', 'Salary (Present Days & PL)']);
        rows.forEach((r, i) => {
          const plCount = (attendance[attMKey]?.[`pl${r.employee.id}`] || []).length;
          aoa.push([i + 1, r.employee.name, r.employee.guardian || '', Math.round(r.employee.salary), parseFloat(r.perDay.toFixed(2)), r.daysPresent, r.daysAbsent, plCount || '-', Math.round(r.grossAfterAbsent)]);
        });
        const plTotal = rows.reduce((s, r) => s + (attendance[attMKey]?.[`pl${r.employee.id}`] || []).length, 0);
        aoa.push([`SUBTOTAL - ${firm}`, '', '', '', '', '', ft.absent, plTotal || '-', Math.round(rows.reduce((s, r) => s + r.grossAfterAbsent, 0))]);
        aoa.push([]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 8 }, { wch: 12 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(wb, ws, `${MONTH_NAMES[monthIdx]} ${year}`.substring(0, 31));
      XLSX.writeFile(wb, `Attendance_${MONTH_NAMES[monthIdx]}_${year}.xlsx`);
    } else if (tab === 'employees') {
      const sheet = [['#', 'Name', 'Guardian', 'Firm', 'Salary', 'ESI', 'Bonus', 'PF', 'Paid Leave'], ...employees.map((e, i) => [i + 1, e.name, e.guardian, e.firm, e.salary, e.esi ? 'YES' : 'NO', e.bonus ? 'YES' : 'NO', e.pf ? 'YES' : 'NO', e.paidLeave ? 'YES' : 'NO'])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), 'Employees');
      XLSX.writeFile(wb, `${slug}_Employees_${MONTH_NAMES[monthIdx]}_${year}.xlsx`);
    } else if (tab === 'holidays') {
      const sheet = [['#', 'Date', 'Holiday', 'Type', 'Status'], ...holidays.map((h, i) => [i + 1, h.date, h.name, h.type, h.observed ? 'YES' : 'NO'])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), 'Holidays');
      XLSX.writeFile(wb, `${slug}_Holidays_${year}.xlsx`);
    } else if (tab === 'components') {
      const summary = computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components });
      const visibleFirms = selectedFirms.length === 0 ? [...new Set(employees.map((e) => e.firm))] : selectedFirms;
      const augRows = summary.rows.map((r) => ({ ...r, employeePf: r.pfDeduct, employerPf: r.employerPfDeduct, net: r.netPayable }));
      const aoa = [];
      aoa.push([`Payroll Components - ${MONTH_NAMES[monthIdx]} ${year}`]);
      aoa.push([`PF Rate: ${components?.pf?.rate ?? 12}% | ESI: 0.75%/3.25% | Exported: ${new Date().toLocaleDateString('en-IN')}`]);
      aoa.push([]);
      visibleFirms.forEach((firm) => {
        const rows = augRows.filter((r) => r.employee.firm === firm);
        aoa.push([`Firm: ${firm}`]);
        aoa.push(['#', 'Employee', 'Gross Salary', 'Salary (Present Days & PL)', 'Employee ESI', 'Employer ESI', 'Employee PF', 'Employer PF', 'Bonus', 'NET Salary (without Bonus)']);
        rows.forEach((r, i) => {
          aoa.push([i + 1, r.employee.name, Math.round(r.employee.salary), Math.round(r.grossAfterAbsent), Math.round(r.esiDeduct), Math.round(r.employerEsi), Math.round(r.employeePf), Math.round(r.employerPf), r.bonus > 0 ? Math.round(r.bonus) : 0, Math.round(r.net)]);
        });
        const tot = rows.reduce((a, r) => ({ gross: a.gross + r.employee.salary, salPres: a.salPres + r.grossAfterAbsent, empEsi: a.empEsi + r.esiDeduct, emplEsi: a.emplEsi + r.employerEsi, empPf: a.empPf + r.employeePf, emplPf: a.emplPf + r.employerPf, bonus: a.bonus + r.bonus, net: a.net + r.net }), { gross: 0, salPres: 0, empEsi: 0, emplEsi: 0, empPf: 0, emplPf: 0, bonus: 0, net: 0 });
        aoa.push([`SUBTOTAL - ${firm}`, '', Math.round(tot.gross), Math.round(tot.salPres), Math.round(tot.empEsi), Math.round(tot.emplEsi), Math.round(tot.empPf), Math.round(tot.emplPf), tot.bonus > 0 ? Math.round(tot.bonus) : 0, Math.round(tot.net)]);
        aoa.push([]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 10 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, `Components ${MONTH_NAMES[monthIdx]}`.substring(0, 31));
      XLSX.writeFile(wb, `Components_${MONTH_NAMES[monthIdx]}_${year}.xlsx`);
    }
  };

  // ── PDF export (unchanged logic) ────────────────────────────────────────────
  const exportPDF = () => {
    const pdfINR      = (n) => 'Rs.' + Math.round(n).toLocaleString('en-IN');
    const pdfINRExact = (n) => 'Rs.' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const GOLD = [190, 140, 40], DARK = [35, 35, 35], GREY = [225, 225, 225], WHITE = [255, 255, 255];
    const headStyles = { fillColor: DARK, textColor: [210, 155, 55], fontStyle: 'bold', fontSize: 7.5 };
    const bodyStyles = { fontSize: 7.5, textColor: [30, 30, 30] };
    const altStyles  = { fillColor: [248, 248, 248] };
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const writeHeader = (title, sub) => {
      doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.text(title, 14, 14);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120); doc.text(sub, 14, 20); doc.setTextColor(0, 0, 0);
    };
    const writeFirmLabel = (firm, y) => { doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40); doc.text(firm, 14, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); };
    if (tab === 'attendance') {
      const summary = computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components });
      const visibleFirms = selectedFirms.length === 0 ? [...new Set(employees.map((e) => e.firm))] : selectedFirms;
      const publicHols = holidays.filter((h) => { if (!h.observed) return false; const d = new Date(h.date); return d.getFullYear() === year && d.getMonth() === monthIdx; }).length;
      writeHeader(`Attendance Sheet - ${MONTH_NAMES[monthIdx]} ${year}`, `26-Day Policy  |  ${publicHols} Observed Holiday${publicHols !== 1 ? 's' : ''}  |  Per-Day = Salary / ${AEEPL_DIVISOR}  |  Exported: ${new Date().toLocaleDateString('en-IN')}`);
      const pdfMKey = monthKey(year, monthIdx);
      const COL = { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 48 }, 2: { cellWidth: 26, halign: 'right' }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 22, halign: 'center' }, 5: { cellWidth: 14, halign: 'center' }, 6: { cellWidth: 16, halign: 'center' }, 7: { cellWidth: 28, halign: 'right' } };
      const HEAD = [['#', 'Employee', 'Gross Salary', 'Per-day', 'Days Present', 'Absent', 'Paid Leaves', 'Salary (Present Days & PL)']];
      let curY = 25;
      visibleFirms.forEach((firm, fi) => {
        const rows = summary.rows.filter((r) => r.employee.firm === firm);
        writeFirmLabel(firm, curY);
        const body = rows.map((r, i) => {
          const plCount = (attendance[pdfMKey]?.[`pl${r.employee.id}`] || []).length;
          return [i + 1, r.employee.name + (r.employee.guardian ? `\n${r.employee.guardian}` : ''), pdfINR(r.employee.salary), pdfINRExact(r.perDay), `${r.daysPresent}/${AEEPL_DIVISOR}`, r.daysAbsent > 0 ? r.daysAbsent : '-', plCount > 0 ? plCount : '-', pdfINR(r.grossAfterAbsent)];
        });
        const firmAbsent = rows.reduce((s, r) => s + r.daysAbsent, 0);
        const firmPL     = rows.reduce((s, r) => s + (attendance[pdfMKey]?.[`pl${r.employee.id}`] || []).length, 0);
        const firmGross  = rows.reduce((s, r) => s + r.grossAfterAbsent, 0);
        body.push([
          { content: `SUBTOTAL - ${firm}`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40] } },
          { content: firmAbsent > 0 ? firmAbsent : '-', styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'center' } },
          { content: firmPL > 0 ? firmPL : '-',         styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'center' } },
          { content: pdfINR(firmGross),                 styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } },
        ]);
        autoTable(doc, { startY: curY + 4, head: HEAD, body, theme: 'grid', headStyles, bodyStyles, alternateRowStyles: altStyles, columnStyles: COL, margin: { left: 14, right: 14 } });
        curY = doc.lastAutoTable.finalY + (fi < visibleFirms.length - 1 ? 10 : 6);
      });
      if (selectedFirms.length === 0) {
        const grandPL = summary.rows.reduce((s, r) => s + (attendance[pdfMKey]?.[`pl${r.employee.id}`] || []).length, 0);
        autoTable(doc, { startY: curY, body: [[{ content: 'GRAND TOTAL', colSpan: 5, styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE } }, { content: summary.totals.daysAbsent > 0 ? summary.totals.daysAbsent : '-', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'center' } }, { content: grandPL > 0 ? grandPL : '-', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'center' } }, { content: pdfINR(summary.totals.gross), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }]], theme: 'grid', bodyStyles: { fontSize: 8.5 }, columnStyles: COL, margin: { left: 14, right: 14 } });
      }
      doc.save(`Attendance_${MONTH_NAMES[monthIdx]}_${year}.pdf`);
    } else if (tab === 'components') {
      const summary = computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components });
      const visibleFirms = selectedFirms.length === 0 ? [...new Set(employees.map((e) => e.firm))] : selectedFirms;
      const augRows = summary.rows.map((r) => ({ ...r, employeePf: r.pfDeduct, employerPf: r.employerPfDeduct, net: r.netPayable }));
      writeHeader(`Payroll Components - ${MONTH_NAMES[monthIdx]} ${year}`, `PF Rate: ${components?.pf?.rate ?? 12}%  |  Employee ESI: 0.75%  |  Employer ESI: 3.25%  |  Exported: ${new Date().toLocaleDateString('en-IN')}`);
      const COL = { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 48 }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 20, halign: 'right' }, 6: { cellWidth: 20, halign: 'right' }, 7: { cellWidth: 20, halign: 'right' }, 8: { cellWidth: 18, halign: 'right' }, 9: { cellWidth: 28, halign: 'right' } };
      const HEAD = [['#', 'Employee', 'Gross Salary', 'Salary (Present Days & PL)', 'Employee ESI', 'Employer ESI', 'Employee PF', 'Employer PF', 'Bonus', 'NET Salary (without Bonus)']];
      let curY = 25;
      visibleFirms.forEach((firm, fi) => {
        const rows = augRows.filter((r) => r.employee.firm === firm);
        const tot = rows.reduce((a, r) => ({ gross: a.gross + r.employee.salary, salPres: a.salPres + r.grossAfterAbsent, empEsi: a.empEsi + r.esiDeduct, emplEsi: a.emplEsi + r.employerEsi, empPf: a.empPf + r.employeePf, emplPf: a.emplPf + r.employerPf, bonus: a.bonus + r.bonus, net: a.net + r.net }), { gross: 0, salPres: 0, empEsi: 0, emplEsi: 0, empPf: 0, emplPf: 0, bonus: 0, net: 0 });
        writeFirmLabel(firm, curY);
        const body = rows.map((r, i) => [i + 1, r.employee.name + (r.employee.guardian ? `\n${r.employee.guardian}` : ''), pdfINR(r.employee.salary), pdfINR(r.grossAfterAbsent), r.esiDeduct > 0 ? pdfINR(r.esiDeduct) : '-', r.employerEsi > 0 ? pdfINR(r.employerEsi) : '-', r.employeePf > 0 ? pdfINR(r.employeePf) : '-', r.employerPf > 0 ? pdfINR(r.employerPf) : '-', r.bonus > 0 ? pdfINR(r.bonus) : '-', pdfINR(r.net)]);
        body.push([{ content: `SUBTOTAL - ${firm}`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40] } }, { content: pdfINR(tot.gross), styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }, { content: pdfINR(tot.salPres), styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }, { content: pdfINR(tot.empEsi), styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }, { content: pdfINR(tot.emplEsi), styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }, { content: tot.empPf > 0 ? pdfINR(tot.empPf) : '-', styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }, { content: tot.emplPf > 0 ? pdfINR(tot.emplPf) : '-', styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }, { content: tot.bonus > 0 ? pdfINR(tot.bonus) : '-', styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }, { content: pdfINR(tot.net), styles: { fontStyle: 'bold', fillColor: GREY, textColor: [40, 40, 40], halign: 'right' } }]);
        autoTable(doc, { startY: curY + 4, head: HEAD, body, theme: 'grid', headStyles, bodyStyles, alternateRowStyles: altStyles, columnStyles: COL, margin: { left: 14, right: 14 } });
        curY = doc.lastAutoTable.finalY + (fi < visibleFirms.length - 1 ? 10 : 6);
      });
      if (selectedFirms.length === 0) {
        const grand = augRows.reduce((a, r) => ({ gross: a.gross + r.employee.salary, salPres: a.salPres + r.grossAfterAbsent, empEsi: a.empEsi + r.esiDeduct, emplEsi: a.emplEsi + r.employerEsi, empPf: a.empPf + r.employeePf, emplPf: a.emplPf + r.employerPf, bonus: a.bonus + r.bonus, net: a.net + r.net }), { gross: 0, salPres: 0, empEsi: 0, emplEsi: 0, empPf: 0, emplPf: 0, bonus: 0, net: 0 });
        autoTable(doc, { startY: curY, body: [[{ content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE } }, { content: pdfINR(grand.gross), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: pdfINR(grand.salPres), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: pdfINR(grand.empEsi), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: pdfINR(grand.emplEsi), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: grand.empPf > 0 ? pdfINR(grand.empPf) : '-', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: grand.emplPf > 0 ? pdfINR(grand.emplPf) : '-', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: grand.bonus > 0 ? pdfINR(grand.bonus) : '-', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: pdfINR(grand.net), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }]], theme: 'grid', bodyStyles: { fontSize: 8.5 }, columnStyles: COL, margin: { left: 14, right: 14 } });
      }
      doc.save(`Components_${MONTH_NAMES[monthIdx]}_${year}.pdf`);
    } else if (tab === 'overview') {
      const summary = computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components });
      writeHeader(`Payroll Overview - ${MONTH_NAMES[monthIdx]} ${year}`, `${summary.headcount} Employees  |  ${summary.publicHolidays} Observed Holidays  |  Exported: ${new Date().toLocaleDateString('en-IN')}`);
      autoTable(doc, { startY: 26, head: [['Metric', 'Value']], body: [['Total Employees', summary.headcount], ['Public Holidays', summary.publicHolidays], ['Total Days in Month', summary.totalDays], ['Gross Salary', pdfINR(summary.totals.gross)], ['Employee ESI Deducted', pdfINR(summary.totals.esiDeduct)], ['Employer ESI', pdfINR(summary.totals.employerEsi)], ['PF Deducted', pdfINR(summary.totals.pfDeduct)], ['Bonus', pdfINR(summary.totals.bonus)], ['Net Payable', pdfINR(summary.totals.netPayable)]], theme: 'grid', headStyles, bodyStyles, alternateRowStyles: altStyles, columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 50, halign: 'right' } }, margin: { left: 14, right: 14 } });
      let curY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Firm-wise Breakdown', 14, curY); curY += 4;
      autoTable(doc, { startY: curY, head: [['Firm', 'Head-count', 'Gross (₹)', 'Employee ESI (₹)', 'Employer ESI (₹)', 'PF (₹)', 'Bonus (₹)', 'Net Payable (₹)']], body: [...summary.firmBreakdown.map((f) => [f.firm, f.headcount, pdfINR(f.gross), pdfINR(f.esiDeduct), pdfINR(f.employerEsi), f.pfDeduct > 0 ? pdfINR(f.pfDeduct) : '-', f.bonus > 0 ? pdfINR(f.bonus) : '-', pdfINR(f.netPayable)]), [{ content: 'GRAND TOTAL', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE } }, { content: summary.headcount, styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'center' } }, { content: pdfINR(summary.totals.gross), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: pdfINR(summary.totals.esiDeduct), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: pdfINR(summary.totals.employerEsi), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: summary.totals.pfDeduct > 0 ? pdfINR(summary.totals.pfDeduct) : '-', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: summary.totals.bonus > 0 ? pdfINR(summary.totals.bonus) : '-', styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }, { content: pdfINR(summary.totals.netPayable), styles: { fontStyle: 'bold', fillColor: GOLD, textColor: WHITE, halign: 'right' } }]], theme: 'grid', headStyles, bodyStyles, alternateRowStyles: altStyles, columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 25, halign: 'right' }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' }, 5: { cellWidth: 20, halign: 'right' }, 6: { cellWidth: 20, halign: 'right' }, 7: { cellWidth: 26, halign: 'right' } }, margin: { left: 14, right: 14 } });
      doc.save(`Overview_${MONTH_NAMES[monthIdx]}_${year}.pdf`);
    } else if (tab === 'employees') {
      writeHeader('Employee Master', `${employees.length} Employees  |  Exported: ${new Date().toLocaleDateString('en-IN')}`);
      autoTable(doc, { startY: 26, head: [['#', 'Name', 'Guardian', 'Firm', 'Salary', 'ESI', 'Bonus', 'PF', 'Paid Leave']], body: employees.map((e, i) => [i + 1, e.name, e.guardian || '', e.firm, pdfINR(e.salary), e.esi ? 'YES' : 'NO', e.bonus ? 'YES' : 'NO', e.pf ? 'YES' : 'NO', e.paidLeave ? 'YES' : 'NO']), theme: 'grid', headStyles, bodyStyles, alternateRowStyles: altStyles, columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 45 }, 2: { cellWidth: 40 }, 3: { cellWidth: 55 }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 14, halign: 'center' }, 6: { cellWidth: 14, halign: 'center' }, 7: { cellWidth: 10, halign: 'center' }, 8: { cellWidth: 18, halign: 'center' } }, margin: { left: 14, right: 14 } });
      doc.save(`Employees_${year}.pdf`);
    } else if (tab === 'holidays') {
      writeHeader(`Holiday Calendar ${year}`, `${holidays.filter((h) => h.observed).length} Observed Holidays  |  Exported: ${new Date().toLocaleDateString('en-IN')}`);
      autoTable(doc, { startY: 26, head: [['#', 'Date', 'Holiday', 'Type', 'Status']], body: holidays.map((h, i) => [i + 1, h.date, h.name, h.type, h.observed ? 'YES' : 'NO']), theme: 'grid', headStyles, bodyStyles, alternateRowStyles: altStyles, columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 26 }, 2: { cellWidth: 76 }, 3: { cellWidth: 28 }, 4: { cellWidth: 20, halign: 'center' } }, margin: { left: 14, right: 14 } });
      doc.save(`Holidays_${year}.pdf`);
    } else {
      doc.setFontSize(12); doc.text('No PDF export for this page.', 14, 20);
      doc.save(`Export_${new Date().toISOString().slice(0, 10)}.pdf`);
    }
  };

  // ── JSON backup ──────────────────────────────────────────────────────────────
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ employees, holidays, attendance, year, monthIdx }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `payroll-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.employees)        await setEmployees(data.employees);
        if (data.holidays)         await setHolidays(data.holidays);
        if (data.attendance)       await setAttendance(data.attendance);
        if (data.year)             setYear(data.year);
        if (data.monthIdx != null) setMonthIdx(data.monthIdx);
        alert('Backup imported successfully.');
      } catch (err) { alert('Invalid backup file: ' + err.message); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  const tabs = [
    { id: 'overview',   label: 'Overview',   icon: <LayoutDashboard size={14} /> },
    { id: 'attendance', label: 'Attendance', icon: <CalendarCheck   size={14} /> },
    { id: 'components', label: 'Components', icon: <Layers          size={14} /> },
    { id: 'employees',  label: 'Employees',  icon: <Users           size={14} /> },
    { id: 'empdocs',    label: 'Emp. Docs',  icon: <FolderOpen      size={14} /> },
    { id: 'holidays',   label: 'Calendar',   icon: <CalendarRange   size={14} /> },
    { id: 'atlashai',   label: 'Atlash AI',  icon: <Sparkles        size={14} /> },
  ];

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">
            {firmOptions.length > 0 ? <FirmPicker firmOptions={firmOptions} /> : companyName}
          </div>
          <h1>Payroll & <em>Attendance</em></h1>
          <div className="brand-sub">
            Interactive payroll dashboard · {employees.length} employees · {MONTH_NAMES[monthIdx]} {year}
          </div>
        </div>

        <div className="topbar-actions">
          {/* Subtle trial pill — shown when > 7 days left (warning banner handles ≤ 7) */}
          {plan === 'trial' && trialUrgency === 'normal' && isOwnerUser && (
            <button
              onClick={() => setShowBilling(true)}
              title="Free trial active — click to view plans"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(212,160,74,0.1)', border: '1px solid rgba(212,160,74,0.25)',
                borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
                fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em', fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={11} /> Trial · {trialDaysLeft}d left
            </button>
          )}

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)} title="Previous month"><ChevronLeft size={14} /></button>
            <select className="select" value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))} style={{ border: 'none', background: 'transparent' }}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ border: 'none', background: 'transparent', width: 80 }}>
              {Array.from({ length: 7 }, (_, i) => 2024 + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)} title="Next month"><ChevronRight size={14} /></button>
          </div>

          <div style={{ position: 'relative' }}>
            <button className="btn btn-sm" onClick={() => setShowExportMenu((v) => !v)} style={{ gap: 5 }}>
              <Download size={13} /> Export <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>&#9662;</span>
            </button>
            {showExportMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowExportMenu(false)} />
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 99, background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', minWidth: 170, overflow: 'hidden' }}>
                  <button onClick={() => { exportExcel(); setShowExportMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                    <FileSpreadsheet size={15} style={{ color: '#4caf70', flexShrink: 0 }} /> Excel (.xlsx)
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 10px' }} />
                  <button onClick={() => { exportPDF(); setShowExportMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                    <FileText size={15} style={{ color: '#e05c5c', flexShrink: 0 }} /> PDF (.pdf)
                  </button>
                </div>
              </>
            )}
          </div>

          <button className="btn btn-sm" onClick={exportJSON}><Download size={13} /> Backup</button>
          <button className="btn btn-sm btn-ghost" onClick={() => fileInput.current?.click()}><Upload size={13} /> Restore</button>
          <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importJSON} />

          <ProfileDropdown
            firms={firms} activeFirmId={activeFirmId} switchFirm={switchFirm}
            firebaseUser={firebaseUser} userProfile={userProfile}
            updateFirms={updateFirms} updateAvatar={updateAvatar}
            userRole={userRole} isOwnerUser={isOwnerUser} plan={plan}
            onManageUsers={() => setShowUserMgmt(true)}
            onBilling={() => setShowBilling(true)}
          />
        </div>
      </div>

      {/* Trial banner — only shown for warning/critical/expired states */}
      {plan === 'trial' && trialUrgency !== 'normal' && (
        <div style={{
          margin: '8px 0 0',
          padding: '10px 16px',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          background: trialUrgency === 'expired'  ? 'rgba(212,106,90,0.12)' :
                      trialUrgency === 'critical' ? 'rgba(212,106,90,0.08)' :
                                                    'rgba(255,150,50,0.08)',
          border: `1px solid ${trialUrgency === 'expired' || trialUrgency === 'critical' ? 'rgba(212,106,90,0.4)' : 'rgba(255,150,50,0.35)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlarmClock size={14} style={{ color: trialUrgency === 'warning' ? '#ff9632' : 'var(--danger)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: trialUrgency === 'warning' ? '#ff9632' : 'var(--danger)', fontWeight: 500 }}>
              {trialUrgency === 'expired'  && 'Your 30-day free trial has ended. Choose a plan to continue.'}
              {trialUrgency === 'critical' && `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}! Upgrade now to avoid losing access.`}
              {trialUrgency === 'warning'  && `Trial ends in ${trialDaysLeft} days — upgrade now to keep access after your trial.`}
            </span>
          </div>
          {isOwnerUser && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowBilling(true)}
              style={{
                fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0,
                background: trialUrgency === 'warning' ? '#ff9632' : 'var(--danger)',
                border: 'none',
              }}
            >
              {trialUrgency === 'expired' ? 'Choose a plan' : 'Upgrade Now →'}
            </button>
          )}
        </div>
      )}

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="tab-dot" />{t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'   && <Overview />}
      {tab === 'attendance' && <Attendance />}
      {tab === 'employees'  && <Employees />}
      {tab === 'empdocs'    && <EmpDocs />}
      {tab === 'components' && <PayrollComponents />}
      {tab === 'holidays'   && <Holidays />}
      {tab === 'atlashai'   && <AtlashAI firebaseUser={firebaseUser} />}

      <footer style={{ marginTop: 60, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-faint)', fontSize: 12, flexWrap: 'wrap', gap: 12 }}>
        <span><Zap size={11} style={{ verticalAlign: 'middle' }} /> Data synced in real-time via Firebase</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[
            { Icon: FacebookIcon,  label: 'Facebook',    href: '#', hoverColor: '#1877F2' },
            { Icon: InstagramIcon, label: 'Instagram',   href: '#', hoverColor: '#E4405F' },
            { Icon: RedditIcon,    label: 'Reddit',      href: '#', hoverColor: '#FF4500' },
            { Icon: TwitterIcon,   label: 'Twitter / X', href: '#', hoverColor: '#111' },
          ].map(({ Icon, label, href, hoverColor }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--border)', color: 'var(--text-faint)', transition: 'all 0.18s', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = hoverColor; e.currentTarget.style.background = hoverColor + '18'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}>
              <Icon />
            </a>
          ))}
          <button onClick={() => setShowWAContact(true)} title="Contact via WhatsApp"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--border)', color: 'var(--text-faint)', background: 'none', cursor: 'pointer', transition: 'all 0.18s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#25D366'; e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.background = '#25D36618'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}>
            <WhatsAppIcon />
          </button>
        </div>

        <span className="mono">ESI 0.75%/3.25% · BONUS 8.33%</span>
      </footer>

      {showUserMgmt && companyId && (
        <UserManagement
          companyId={companyId} companyName={companyName}
          currentUserUid={firebaseUser?.uid} inviterEmail={firebaseUser?.email}
          ownerUid={ownerUid} plan={plan}
          onClose={() => setShowUserMgmt(false)}
          onUpgrade={() => setShowBilling(true)}
        />
      )}

      {showBilling && isOwnerUser && (
        <Billing
          firebaseUser={firebaseUser} ownerUid={ownerUid}
          onClose={trialExpired ? undefined : () => setShowBilling(false)}
          trialExpired={trialExpired}
          createdAt={userProfile?.createdAt}
        />
      )}

      {/* Welcome modal — shown once on first dashboard visit for trial users */}
      {showWelcome && (
        <WelcomeTrialModal
          orgName={companyName}
          trialEndDate={trialEndDate}
          onClose={dismissWelcome}
        />
      )}

      {showWAContact && <WhatsAppContactModal onClose={() => setShowWAContact(false)} />}
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [authStatus,      setAuthStatus]      = useState('loading');
  const [firebaseUser,    setFirebaseUser]    = useState(null);
  const [userProfile,     setUserProfile]     = useState(null);
  const [activeFirmId,    setActiveFirmId]    = useState(() => loadUI().activeFirmId || null);
  const [isOwnerUser,     setIsOwnerUser]     = useState(false);
  const [userMemberships, setUserMemberships] = useState([]);
  const [ownerUid,        setOwnerUid]        = useState(null);

  const firms       = normalizeFirms(userProfile);
  const activeFirm  = firms.find((f) => f.id === activeFirmId) ?? firms[0] ?? null;
  const companyId   = activeFirm?.id   ?? null;
  const companyName = activeFirm?.name ?? 'My Company';
  const plan        = userProfile?.plan || 'free';

  const currentUserRole = isOwnerUser
    ? 'admin'
    : (userMemberships.find((m) => m.companyId === activeFirmId)?.role ?? 'viewer');

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null); setUserProfile(null); setActiveFirmId(null);
        setIsOwnerUser(false); setUserMemberships([]); setOwnerUid(null);
        setAuthStatus('logged-out');
        return;
      }

      // Block unverified email/password accounts
      const isEmailPassword = user.providerData.some((p) => p.providerId === 'password');
      if (isEmailPassword && !user.emailVerified) {
        setFirebaseUser(user);
        setAuthStatus('needs-email-verification');
        return;
      }

      // 1. Owner path — check own profile
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const profile = snap.data();
        setFirebaseUser(user); setIsOwnerUser(true); setUserProfile(profile); setOwnerUid(user.uid);
        const f = normalizeFirms(profile);
        const savedId = loadUI().activeFirmId;
        const validId = f.find((firm) => firm.id === savedId) ? savedId : f[0]?.id ?? null;
        setActiveFirmId(validId);
        setAuthStatus('ready');
        return;
      }

      // 2. Invited user path — check existing memberships
      const umSnap = await getDoc(doc(db, 'userMemberships', user.uid));
      if (umSnap.exists() && umSnap.data().companies?.length > 0) {
        const memberships = umSnap.data().companies;
        const f = memberships.map((m) => ({ id: m.companyId, name: m.companyName }));
        const savedId = loadUI().activeFirmId;
        const validId = f.find((firm) => firm.id === savedId) ? savedId : f[0]?.id ?? null;
        const activeMem = memberships.find((m) => m.companyId === validId) || memberships[0];
        setFirebaseUser(user); setIsOwnerUser(false); setUserMemberships(memberships);
        setUserProfile({ firms: f }); setActiveFirmId(validId);
        setOwnerUid(activeMem?.ownerUid || null);
        setAuthStatus('ready');
        return;
      }

      // 3. Check pending invites by email and provision
      if (user.email) {
        const invQ    = query(collection(db, 'invites'), where('email', '==', user.email.toLowerCase()));
        const invSnap = await getDocs(invQ);
        if (!invSnap.empty) {
          const memberships = [];
          for (const inviteDoc of invSnap.docs) {
            const invite   = inviteDoc.data();
            const compRef  = doc(db, 'companies', invite.companyId);
            const compSnap = await getDoc(compRef);
            const existing = compSnap.exists() ? (compSnap.data().members || {}) : {};
            await setDoc(compRef, { members: { ...existing, [user.uid]: { email: user.email, role: invite.role, addedAt: Date.now() } } }, { merge: true });
            memberships.push({ companyId: invite.companyId, companyName: invite.companyName, role: invite.role, ownerUid: invite.ownerUid || invite.addedBy });
            await deleteDoc(doc(db, 'invites', inviteDoc.id));
          }
          await setDoc(doc(db, 'userMemberships', user.uid), { companies: memberships });
          const f = memberships.map((m) => ({ id: m.companyId, name: m.companyName }));
          const savedId = loadUI().activeFirmId;
          const validId = f.find((firm) => firm.id === savedId) ? savedId : f[0]?.id ?? null;
          const activeMem = memberships.find((m) => m.companyId === validId) || memberships[0];
          setFirebaseUser(user); setIsOwnerUser(false); setUserMemberships(memberships);
          setUserProfile({ firms: f }); setActiveFirmId(validId);
          setOwnerUid(activeMem?.ownerUid || null);
          setAuthStatus('ready');
          return;
        }
      }

      // 4. Brand-new user — go to onboarding
      setFirebaseUser(user); setIsOwnerUser(true);
      setAuthStatus('needs-setup');
    });
  }, []);

  // Persist active firm
  useEffect(() => {
    const current = loadUI();
    localStorage.setItem(UI_KEY, JSON.stringify({ ...current, activeFirmId }));
  }, [activeFirmId]);

  const switchFirm = (firmId) => setActiveFirmId(firmId);

  const updateFirms = async (newFirms) => {
    const updated = { ...userProfile, firms: newFirms };
    await setDoc(doc(db, 'users', firebaseUser.uid), updated);
    setUserProfile(updated);
  };

  const updateAvatar = async (url) => {
    const updated = { ...userProfile, avatarUrl: url };
    await setDoc(doc(db, 'users', firebaseUser.uid), updated);
    setUserProfile(updated);
  };

  const inner = (() => {
    if (authStatus === 'loading')                  return <Spinner />;
    if (authStatus === 'logged-out')               return <Login />;
    if (authStatus === 'needs-email-verification') return <VerifyEmailScreen user={firebaseUser} />;
    if (authStatus === 'needs-setup')              return (
      <CompanySetup
        user={firebaseUser}
        onComplete={(profile) => {
          setUserProfile({ ...profile, plan: profile.plan || 'free' });
          const f = normalizeFirms(profile);
          setActiveFirmId(f[0]?.id ?? null);
          setOwnerUid(firebaseUser.uid);
          setIsOwnerUser(true);
          setAuthStatus('ready');
        }}
      />
    );
    return (
      <AppProvider
        companyId={companyId} companyName={companyName}
        firms={firms} userRole={currentUserRole}
        plan={plan} ownerUid={ownerUid}
      >
        <AppDashboard
          firms={firms} activeFirmId={activeFirmId} switchFirm={switchFirm}
          firebaseUser={firebaseUser} userProfile={userProfile}
          updateFirms={updateFirms} updateAvatar={updateAvatar}
          userRole={currentUserRole} isOwnerUser={isOwnerUser}
          plan={plan} ownerUid={ownerUid}
        />
      </AppProvider>
    );
  })();

  return (
    <>
      <BackgroundFX />
      <div style={{ position: 'relative', zIndex: 1 }}>{inner}</div>
    </>
  );
}
