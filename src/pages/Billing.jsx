import { useState, useEffect } from 'react';
import { X, Check, CreditCard, Loader2, Zap, Users, Building2, UserCheck, Clock } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase';
import { PLANS, PAID_PLANS, PLAN_ORDER, getPlanLimits, getTrialDaysLeft } from '../lib/planLimits';
import { openRazorpayCheckout } from '../lib/razorpay';
import { useApp } from '../context/AppContext';

function UsageMeter({ label, icon, used, limit, accent }) {
  const pct = limit === Infinity ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isAtLimit = used >= limit;
  return (
    <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-dim)' }}>
          {icon}
          {label}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: isAtLimit ? 'var(--danger)' : 'var(--text)', fontFamily: 'var(--font-mono)' }}>
          {used} / {limit === Infinity ? '∞' : limit}
        </span>
      </div>
      {limit !== Infinity && (
        <div style={{ height: 5, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 3,
            background: isAtLimit ? 'var(--danger)' : accent || 'var(--accent)',
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}
    </div>
  );
}

function PlanCard({ planKey, currentPlan, processing, onUpgrade, onContact }) {
  const p = PLANS[planKey];
  const isCurrent = currentPlan === planKey;
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const thisIdx    = PLAN_ORDER.indexOf(planKey);
  const isDowngrade  = thisIdx < currentIdx;
  const isEnterprise = planKey === 'enterprise';

  return (
    <div style={{
      background: 'var(--bg-1)',
      border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 14,
      padding: '24px 20px',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 0.2s',
    }}>
      {p.badge && (
        <div style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          background: isCurrent ? 'var(--accent)' : 'var(--bg-3)',
          color: isCurrent ? 'var(--bg)' : 'var(--text-dim)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          padding: '2px 10px', borderRadius: 20,
          border: '1px solid var(--border)',
          whiteSpace: 'nowrap',
        }}>
          {p.badge}
        </div>
      )}
      {isCurrent && (
        <div style={{
          position: 'absolute', top: -10, right: 16,
          background: 'var(--accent)', color: 'var(--bg)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          padding: '2px 10px', borderRadius: 20,
          whiteSpace: 'nowrap',
        }}>
          Current
        </div>
      )}

      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{p.label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: isCurrent ? 'var(--accent)' : 'var(--text)', marginBottom: 4, letterSpacing: '-0.02em' }}>
        {p.priceLabel}
      </div>
      {p.price > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 14, fontFamily: 'var(--font-mono)' }}>
          Billed by actual headcount each month
        </div>
      )}
      {!p.price && planKey !== 'enterprise' && (
        <div style={{ marginBottom: 14 }} />
      )}

      <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: 0, flex: 1 }}>
        {p.features.map((f) => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
            <Check size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            {f}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-faint)', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          Active plan
        </div>
      ) : isEnterprise ? (
        <button
          className="btn btn-ghost"
          onClick={onContact}
          style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
        >
          Contact sales
        </button>
      ) : (
        <button
          className="btn btn-primary"
          onClick={() => onUpgrade(planKey)}
          disabled={!!processing}
          style={{
            width: '100%', justifyContent: 'center', fontSize: 13,
            opacity: processing ? 0.7 : 1,
            background: isDowngrade ? 'var(--bg-3)' : 'var(--accent)',
            color: isDowngrade ? 'var(--text-dim)' : 'var(--bg)',
            border: isDowngrade ? '1px solid var(--border)' : 'none',
          }}
        >
          {processing === planKey
            ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</>
            : isDowngrade ? `Switch to ${p.label}` : `Choose ${p.label}`
          }
        </button>
      )}
    </div>
  );
}

export default function Billing({ firebaseUser, ownerUid, onClose, trialExpired = false, createdAt }) {
  const { employees, firms, plan: contextPlan } = useApp();
  const [subscription, setSubscription] = useState(null);
  const [subLoading,   setSubLoading]   = useState(true);
  const [processing,   setProcessing]   = useState(null);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  const plan   = subscription?.plan || contextPlan || 'free';
  const limits = getPlanLimits(plan);

  const isOnTrial      = plan === 'trial';
  const trialDaysLeft  = isOnTrial ? getTrialDaysLeft(createdAt || subscription?.createdAt) : null;
  const trialIsExpired = isOnTrial && trialDaysLeft === 0;

  // Load subscription in real-time
  useEffect(() => {
    if (!ownerUid) { setSubLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'subscriptions', ownerUid), (snap) => {
      setSubscription(snap.exists() ? snap.data() : { plan: 'free', status: 'active' });
      setSubLoading(false);
    }, () => {
      setSubscription({ plan: 'free', status: 'active' });
      setSubLoading(false);
    });
    return unsub;
  }, [ownerUid]);

  const handleUpgrade = async (targetPlan) => {
    if (!ownerUid || !firebaseUser) { setError('Not signed in.'); return; }
    setError('');
    setSuccess('');
    setProcessing(targetPlan);

    try {
      const functions = getFunctions();
      const createSub = httpsCallable(functions, 'createRazorpaySubscription');
      const result    = await createSub({ plan: targetPlan });
      const { subscriptionId, name, email } = result.data;

      await openRazorpayCheckout({
        subscriptionId,
        orgName:     name  || firebaseUser.displayName || '',
        email:       email || firebaseUser.email || '',
        description: `PayrollSaaS ${PLANS[targetPlan].label} Plan`,
        onSuccess: () => {
          setSuccess(`Successfully upgraded to ${PLANS[targetPlan].label}! Your plan will activate shortly.`);
          setProcessing(null);
        },
        onFailure: (reason) => {
          if (reason !== 'checkout_dismissed') {
            setError(reason || 'Payment was not completed.');
          }
          setProcessing(null);
        },
      });
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setProcessing(null);
    }
  };

  const handleContact = () => {
    window.open('mailto:support@payrollsaas.in?subject=Enterprise Plan Enquiry', '_blank');
  };

  const memberCount = 0;

  const canDismiss = !trialExpired && !trialIsExpired;

  return (
    <div className="modal-backdrop" onClick={canDismiss ? onClose : undefined}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 820, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <CreditCard size={16} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0 }}>Billing & Plan</h3>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Manage your subscription and usage
            </div>
          </div>
          {canDismiss && (
            <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
          )}
        </div>

        {subLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)' }}>
            <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Trial status banner */}
            {isOnTrial && (
              <div style={{
                background: trialIsExpired ? 'rgba(212,106,90,0.1)' : 'rgba(212,160,74,0.08)',
                border: `1px solid ${trialIsExpired ? 'var(--danger)' : 'rgba(212,160,74,0.3)'}`,
                borderRadius: 10, padding: '14px 18px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <Clock size={16} style={{ color: trialIsExpired ? 'var(--danger)' : 'var(--accent)', flexShrink: 0 }} />
                <div>
                  {trialIsExpired ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)', marginBottom: 2 }}>
                        Your free trial has ended
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                        Choose a plan below to continue using PayrollSaaS.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 2 }}>
                        Free trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                        All features are unlocked. Choose a plan before your trial ends to keep access.
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Active paid subscription status */}
            {subscription && !isOnTrial && subscription.plan !== 'free' && (
              <div style={{ background: 'rgba(212,160,74,0.08)', border: '1px solid rgba(212,160,74,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Zap size={14} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {PLANS[plan]?.label} Plan
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                    background: subscription.status === 'active' ? 'rgba(100,200,120,0.18)' : 'rgba(212,106,90,0.18)',
                    color: subscription.status === 'active' ? '#64c878' : 'var(--danger)',
                    border: `1px solid ${subscription.status === 'active' ? 'rgba(100,200,120,0.4)' : 'rgba(212,106,90,0.4)'}`,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {subscription.status}
                  </span>
                </div>
                {subscription.currentPeriodEnd && (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>
            )}

            {/* Error / success banners */}
            {error && (
              <div style={{ background: 'rgba(212,106,90,0.12)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: 'rgba(100,200,120,0.12)', border: '1px solid #64c878', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#64c878', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={14} /> {success}
              </div>
            )}

            {/* Usage meters */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10 }}>
                Current usage
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <UsageMeter
                  label="Employees"
                  icon={<Users size={13} />}
                  used={employees?.length || 0}
                  limit={limits.employees}
                />
                <UsageMeter
                  label="Firms / Branches"
                  icon={<Building2 size={13} />}
                  used={firms?.length || 0}
                  limit={limits.firms}
                />
                <UsageMeter
                  label="Team Members"
                  icon={<UserCheck size={13} />}
                  used={memberCount}
                  limit={limits.teamMembers}
                />
              </div>
            </div>

            {/* Plan cards — paid plans only */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 14 }}>
                {isOnTrial ? 'Choose your plan' : 'Available plans'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                {PAID_PLANS.map((planKey) => (
                  <PlanCard
                    key={planKey}
                    planKey={planKey}
                    currentPlan={plan}
                    processing={processing}
                    onUpgrade={handleUpgrade}
                    onContact={handleContact}
                  />
                ))}
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 16, textAlign: 'center', lineHeight: 1.6 }}>
              Pricing is per employee per month, billed on actual headcount.
              Payments are processed securely by Razorpay. Cancel anytime.
              <br />
              For billing queries, email <span style={{ fontFamily: 'var(--font-mono)' }}>support@payrollsaas.in</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
