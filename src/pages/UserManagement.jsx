import { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Mail, Loader2, CreditCard } from 'lucide-react';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import emailjs from '@emailjs/browser';
import { db } from '../firebase';
import { canAddTeamMember, getUpgradeMessage, getPlanLimits } from '../lib/planLimits';

const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

const ROLE_COLORS = {
  admin:  { background: 'rgba(212,160,74,0.15)',  color: '#d4a04a',  border: '1px solid rgba(212,160,74,0.3)'  },
  editor: { background: 'rgba(106,154,212,0.15)', color: '#6a9ad4',  border: '1px solid rgba(106,154,212,0.3)' },
  viewer: { background: 'rgba(150,150,150,0.15)', color: '#aaaaaa',  border: '1px solid rgba(150,150,150,0.3)' },
};

const ROLE_DESCRIPTIONS = {
  admin:  'Full access — data, holidays, components, user management',
  editor: 'Can edit attendance & employees, view-only for components',
  viewer: 'Read-only access to all data',
};

export default function UserManagement({ companyId, companyName, currentUserUid, inviterEmail, ownerUid, plan, onClose, onUpgrade }) {
  const [members,     setMembers]     = useState({});
  const [invites,     setInvites]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState('viewer');
  const [sending,     setSending]     = useState(false);
  const [error,       setError]       = useState('');

  const currentPlan = plan || 'free';
  const limits = getPlanLimits(currentPlan);

  const loadData = async () => {
    setLoading(true);
    const compSnap = await getDoc(doc(db, 'companies', companyId));
    setMembers(compSnap.exists() ? (compSnap.data().members || {}) : {});
    const q = query(collection(db, 'invites'), where('companyId', '==', companyId));
    const invSnap = await getDocs(q);
    setInvites(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [companyId]);

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) { setError('Enter an email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Invalid email address.'); return; }
    if (Object.values(members).some((m) => m.email.toLowerCase() === email)) {
      setError('This user is already a member.'); return;
    }
    if (invites.some((inv) => inv.email.toLowerCase() === email)) {
      setError('An invite has already been sent to this email.'); return;
    }

    // Plan limit check
    const totalSeats = Object.keys(members).length + invites.length;
    if (!canAddTeamMember(currentPlan, totalSeats)) {
      setError(getUpgradeMessage(currentPlan, 'teamMembers'));
      return;
    }

    setSending(true);
    setError('');

    await addDoc(collection(db, 'invites'), {
      email,
      companyId,
      companyName,
      role:      inviteRole,
      ownerUid:  ownerUid || currentUserUid,
      addedBy:   currentUserUid,
      createdAt: Date.now(),
    });

    // Send email notification via EmailJS
    if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
      try {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            to_email:     email,
            company_name: companyName,
            role:         inviteRole.charAt(0).toUpperCase() + inviteRole.slice(1),
            invited_by:   inviterEmail || 'The admin',
          },
          { publicKey: EMAILJS_PUBLIC_KEY },
        );
      } catch (emailErr) {
        console.error('EmailJS error:', emailErr);
        const reason = emailErr?.text || emailErr?.message || String(emailErr);
        setError(`Invite saved, but email failed: ${reason}. The user can still sign in with this email to gain access.`);
      }
    } else {
      console.warn('EmailJS not configured — invite saved without email notification.');
    }

    setInviteEmail('');
    await loadData();
    setSending(false);
  };

  const changeRole = async (uid, newRole) => {
    const updated = { ...members, [uid]: { ...members[uid], role: newRole } };
    await setDoc(doc(db, 'companies', companyId), { members: updated }, { merge: true });
    const umRef  = doc(db, 'userMemberships', uid);
    const umSnap = await getDoc(umRef);
    if (umSnap.exists()) {
      const companies = (umSnap.data().companies || []).map((c) =>
        c.companyId === companyId ? { ...c, role: newRole } : c,
      );
      await setDoc(umRef, { companies });
    }
    setMembers(updated);
  };

  const removeMember = async (uid) => {
    if (!confirm('Remove this user from the company?')) return;
    const updated = { ...members };
    delete updated[uid];
    await setDoc(doc(db, 'companies', companyId), { members: updated }, { merge: true });
    const umRef  = doc(db, 'userMemberships', uid);
    const umSnap = await getDoc(umRef);
    if (umSnap.exists()) {
      const companies = (umSnap.data().companies || []).filter((c) => c.companyId !== companyId);
      await setDoc(umRef, { companies });
    }
    setMembers(updated);
  };

  const revokeInvite = async (inviteId) => {
    await deleteDoc(doc(db, 'invites', inviteId));
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  const memberList = Object.entries(members);
  const totalSeats = memberList.length + invites.length;
  const atLimit    = !canAddTeamMember(currentPlan, totalSeats);

  const ROW_STYLE = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' };
  const ICON_BTN  = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color 0.15s', flexShrink: 0 };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '100%' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0 }}>Manage Users</h3>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>
              {companyName} · <span style={{ color: 'var(--accent)' }}>{memberList.length}/{limits.teamMembers === Infinity ? '∞' : limits.teamMembers} seats used</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        {/* Plan limit banner */}
        {atLimit && (
          <div style={{ background: 'rgba(212,160,74,0.10)', border: '1px solid rgba(212,160,74,0.35)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--accent)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span>Team member limit reached on the <strong>{currentPlan}</strong> plan.</span>
            {onUpgrade && (
              <button
                onClick={() => { onClose(); onUpgrade(); }}
                style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
              >
                <CreditCard size={12} /> Upgrade
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-faint)' }}>
            <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Current Members */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
                Members{memberList.length > 0 ? ` (${memberList.length})` : ''}
              </div>

              {memberList.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '4px 0' }}>
                  No invited members yet. Use the form below to add users.
                </div>
              ) : (
                memberList.map(([uid, member]) => (
                  <div key={uid} style={ROW_STYLE}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--bg)', flexShrink: 0 }}>
                      {member.email[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.email}
                      </div>
                    </div>
                    <select
                      value={member.role}
                      onChange={(e) => changeRole(uid, e.target.value)}
                      className="select"
                      style={{ fontSize: 12, padding: '4px 8px', minWidth: 90 }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      style={ICON_BTN} title="Remove user"
                      onClick={() => removeMember(uid)}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Pending Invites */}
            {invites.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
                  Pending Invites ({invites.length})
                </div>
                {invites.map((invite) => (
                  <div key={invite.id} style={ROW_STYLE}>
                    <Mail size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {invite.email}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', ...ROLE_COLORS[invite.role] }}>
                      {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>Pending</span>
                    <button
                      style={ICON_BTN} title="Revoke invite"
                      onClick={() => revokeInvite(invite.id)}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Invite Form */}
            <div style={{ padding: 16, background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--border)', opacity: atLimit ? 0.6 : 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserPlus size={14} style={{ color: 'var(--accent)' }} />
                Invite User
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }}
                  disabled={atLimit}
                  style={{ flex: 1, minWidth: 180, fontSize: 13, padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 7, color: 'var(--text)', outline: 'none' }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="select"
                  disabled={atLimit}
                  style={{ fontSize: 13, padding: '8px 10px', minWidth: 100 }}
                  title={ROLE_DESCRIPTIONS[inviteRole]}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  className="btn btn-sm"
                  onClick={sendInvite}
                  disabled={sending || atLimit}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--bg)', border: 'none', flexShrink: 0 }}
                >
                  {sending ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <UserPlus size={13} />}
                  {sending ? 'Sending…' : 'Invite'}
                </button>
              </div>

              {error && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{error}</div>}

              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-dim)' }}>{ROLE_DESCRIPTIONS[inviteRole]}.</strong>
                <br />
                The invited user must sign in with this email address to gain access.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
