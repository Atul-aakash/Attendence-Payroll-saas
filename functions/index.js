/* eslint-disable max-len */
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule }                    = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString }    = require('firebase-functions/params');
const admin      = require('firebase-admin');
const Razorpay   = require('razorpay');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// ── Razorpay secrets ──────────────────────────────────────────────────────────
const RAZORPAY_KEY_ID         = defineSecret('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET     = defineSecret('RAZORPAY_KEY_SECRET');
const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
const RAZORPAY_PLAN_STARTER   = defineSecret('RAZORPAY_PLAN_STARTER');
const RAZORPAY_PLAN_PRO       = defineSecret('RAZORPAY_PLAN_PRO');

// ── Email secrets ──────────────────────────────────────────────────────────────
// Set via: firebase functions:secrets:set EMAIL_FROM  etc.
const EMAIL_FROM      = defineSecret('EMAIL_FROM');
const EMAIL_SMTP_USER = defineSecret('EMAIL_SMTP_USER');
const EMAIL_SMTP_PASS = defineSecret('EMAIL_SMTP_PASS');

// ── App URL config (non-secret) ────────────────────────────────────────────────
// Set via: firebase functions:params:set APP_URL=https://your-app.web.app
const APP_URL = defineString('APP_URL', { default: 'https://your-app.web.app' });

const TRIAL_DAYS = 30;

// ── Email helpers ─────────────────────────────────────────────────────────────

function createTransporter(smtpUser, smtpPass) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });
}

async function sendEmail({ to, subject, html, smtpUser, smtpPass, from }) {
  const transporter = createTransporter(smtpUser, smtpPass);
  await transporter.sendMail({ from, to, subject, html });
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function generateWelcomeEmailHtml(orgName, trialEndDate, appUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:Arial,sans-serif;">
  <div style="max-width:580px;margin:40px auto;background:#1a1a1a;border-radius:14px;border:1px solid #2e2e2e;overflow:hidden;">

    <!-- Header -->
    <div style="background:#1e1c17;border-bottom:1px solid #2e2e2e;padding:28px 36px;text-align:center;">
      <div style="font-size:42px;margin-bottom:10px;">🎉</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#d4a04a;letter-spacing:-0.01em;">
        Your 30-day free trial has started!
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:32px 36px;">
      <p style="margin:0 0 16px;font-size:15px;color:#c8bfb0;line-height:1.6;">
        Hi <strong style="color:#e8e0d0;">${orgName}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#c8bfb0;line-height:1.6;">
        Welcome to <strong style="color:#d4a04a;">PayrollSaaS</strong>! Your free trial is now active.
        Explore every feature — payroll, attendance, exports, and more — with no restrictions for
        <strong style="color:#e8e0d0;">30 days</strong>.
      </p>

      <!-- Trial end date pill -->
      <div style="background:#23200f;border:1px solid rgba(212,160,74,0.3);border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">
        <div style="font-size:12px;color:#8a7a55;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Trial active until</div>
        <div style="font-size:20px;font-weight:700;color:#d4a04a;">${trialEndDate}</div>
      </div>

      <!-- Feature list -->
      <p style="margin:0 0 12px;font-size:13px;color:#8a7a55;letter-spacing:0.08em;text-transform:uppercase;">What's included</p>
      <ul style="margin:0 0 28px;padding:0;list-style:none;">
        ${['Unlimited employees & firms', 'Live payroll computation (ESI, PF, Bonus)', 'Attendance tracking with calendar view', 'Excel & PDF export for all reports', 'Employee documents vault', 'Multi-user access (invite your team)'].map((f) =>
    `<li style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #242424;font-size:14px;color:#c8bfb0;">
            <span style="color:#d4a04a;font-size:16px;">✓</span> ${f}
          </li>`).join('')}
      </ul>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="${appUrl}" style="display:inline-block;background:#d4a04a;color:#0f0f0f;font-weight:700;font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">
          Go to Dashboard →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 36px;border-top:1px solid #2e2e2e;text-align:center;">
      <p style="margin:0;font-size:12px;color:#554e40;line-height:1.7;">
        Questions? Reply to this email or write to
        <a href="mailto:support@payrollsaas.in" style="color:#8a7a55;">support@payrollsaas.in</a><br>
        © PayrollSaaS · You're receiving this because you just signed up.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function generateReminderEmailHtml(orgName, daysLeft, trialEndDate, appUrl) {
  const isUrgent  = daysLeft <= 3;
  const accentHex = isUrgent ? '#d46a5a' : '#d4a04a';
  const bgAccent  = isUrgent ? '#230f0f' : '#23200f';
  const borderHex = isUrgent ? 'rgba(212,106,90,0.3)' : 'rgba(212,160,74,0.3)';
  const emoji     = daysLeft <= 1 ? '🚨' : isUrgent ? '⚠️' : '⏰';
  const headline  = daysLeft <= 1
    ? 'Your free trial ends tomorrow!'
    : `Your free trial ends in ${daysLeft} days`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:Arial,sans-serif;">
  <div style="max-width:580px;margin:40px auto;background:#1a1a1a;border-radius:14px;border:1px solid #2e2e2e;overflow:hidden;">

    <!-- Header -->
    <div style="background:#1e1c17;border-bottom:1px solid #2e2e2e;padding:28px 36px;text-align:center;">
      <div style="font-size:42px;margin-bottom:10px;">${emoji}</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:${accentHex};letter-spacing:-0.01em;">
        ${headline}
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:32px 36px;">
      <p style="margin:0 0 16px;font-size:15px;color:#c8bfb0;line-height:1.6;">
        Hi <strong style="color:#e8e0d0;">${orgName}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#c8bfb0;line-height:1.6;">
        Your <strong style="color:#e8e0d0;">PayrollSaaS free trial</strong> will expire on
        <strong style="color:${accentHex};">${trialEndDate}</strong>.
        Upgrade now to keep your data and continue without interruption.
      </p>

      <!-- Expiry pill -->
      <div style="background:${bgAccent};border:1px solid ${borderHex};border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">
        <div style="font-size:12px;color:#8a7a55;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Trial expires on</div>
        <div style="font-size:20px;font-weight:700;color:${accentHex};">${trialEndDate}</div>
      </div>

      <!-- Plans summary -->
      <p style="margin:0 0 12px;font-size:13px;color:#8a7a55;letter-spacing:0.08em;text-transform:uppercase;">Choose a plan</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:10px 12px;border:1px solid #2e2e2e;border-radius:0;font-size:13px;color:#c8bfb0;vertical-align:top;">
            <div style="font-weight:700;color:#e8e0d0;margin-bottom:4px;">Starter</div>
            <div style="font-size:16px;font-weight:700;color:#d4a04a;">₹30<span style="font-size:11px;font-weight:400;color:#8a7a55;">/emp/mo</span></div>
            <div style="font-size:11px;color:#8a7a55;margin-top:3px;">1 firm · 3 users</div>
          </td>
          <td style="padding:10px 12px;border:1px solid #2e2e2e;font-size:13px;color:#c8bfb0;vertical-align:top;">
            <div style="font-weight:700;color:#e8e0d0;margin-bottom:4px;">Pro</div>
            <div style="font-size:16px;font-weight:700;color:#d4a04a;">₹40<span style="font-size:11px;font-weight:400;color:#8a7a55;">/emp/mo</span></div>
            <div style="font-size:11px;color:#8a7a55;margin-top:3px;">3 firms · 5 users</div>
          </td>
          <td style="padding:10px 12px;border:1px solid #2e2e2e;font-size:13px;color:#c8bfb0;vertical-align:top;">
            <div style="font-weight:700;color:#e8e0d0;margin-bottom:4px;">Enterprise</div>
            <div style="font-size:16px;font-weight:700;color:#d4a04a;">₹79<span style="font-size:11px;font-weight:400;color:#8a7a55;">/emp/mo</span></div>
            <div style="font-size:11px;color:#8a7a55;margin-top:3px;">Unlimited firms & users</div>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="${appUrl}" style="display:inline-block;background:${accentHex};color:#0f0f0f;font-weight:700;font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">
          Choose Your Plan →
        </a>
      </div>
      <p style="text-align:center;font-size:12px;color:#554e40;margin:12px 0 0;">
        Pricing is per employee per month, billed on actual headcount.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 36px;border-top:1px solid #2e2e2e;text-align:center;">
      <p style="margin:0;font-size:12px;color:#554e40;line-height:1.7;">
        Questions? Reply to this email or write to
        <a href="mailto:support@payrollsaas.in" style="color:#8a7a55;">support@payrollsaas.in</a><br>
        © PayrollSaaS
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Razorpay helpers ──────────────────────────────────────────────────────────

function getRazorpayClient(keyId, keySecret) {
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function getPlanId(planKey, planStarterId, planProId) {
  if (planKey === 'starter') return planStarterId;
  if (planKey === 'pro')     return planProId;
  return null;
}

// ─── sendWelcomeEmail ─────────────────────────────────────────────────────────
// Called from CompanySetup right after the user completes onboarding.
exports.sendWelcomeEmail = onCall(
  {
    secrets: [EMAIL_FROM, EMAIL_SMTP_USER, EMAIL_SMTP_PASS],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const { orgName, email, createdAt } = request.data;
    if (!email) throw new HttpsError('invalid-argument', 'email is required.');

    const trialEndDate = formatDate(
      new Date(new Date(createdAt || Date.now()).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );

    await sendEmail({
      to:       email,
      subject:  '🎉 Your 30-day free trial has started — PayrollSaaS',
      html:     generateWelcomeEmailHtml(orgName || 'there', trialEndDate, APP_URL.value()),
      from:     EMAIL_FROM.value(),
      smtpUser: EMAIL_SMTP_USER.value(),
      smtpPass: EMAIL_SMTP_PASS.value(),
    });

    return { success: true };
  },
);

// ─── sendTrialReminderIfNeeded ────────────────────────────────────────────────
// Called from the dashboard on load when plan === 'trial'.
// Idempotent: each threshold (7d / 3d / 1d) is sent at most once per user.
exports.sendTrialReminderIfNeeded = onCall(
  {
    secrets: [EMAIL_FROM, EMAIL_SMTP_USER, EMAIL_SMTP_PASS],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const uid = request.auth.uid;

    // Load user + subscription docs in parallel
    const [userSnap, subSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('subscriptions').doc(uid).get(),
    ]);

    if (!userSnap.exists) return { skipped: 'no user doc' };

    const user = userSnap.data();
    if (user.plan !== 'trial') return { skipped: 'not on trial' };

    const createdAt    = user.createdAt ? new Date(user.createdAt) : null;
    if (!createdAt) return { skipped: 'no createdAt' };

    const daysElapsed  = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysLeft     = Math.ceil(TRIAL_DAYS - daysElapsed);

    // Determine which threshold applies right now
    let threshold = null;
    if (daysLeft <= 1)      threshold = '1d';
    else if (daysLeft <= 3) threshold = '3d';
    else if (daysLeft <= 7) threshold = '7d';

    if (!threshold) return { skipped: 'not in reminder window', daysLeft };

    // Skip if already sent
    const sentReminders = subSnap.exists ? (subSnap.data().emailNotificationsSent || []) : [];
    if (sentReminders.includes(threshold)) return { skipped: 'already sent', threshold };

    const trialEndDate = formatDate(
      new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
    const email    = user.email;
    const orgName  = user.orgName || user.displayName || 'there';

    const subjectMap = {
      '7d': `⏰ Your PayrollSaaS trial ends in 7 days`,
      '3d': `⚠️ PayrollSaaS trial ends in 3 days — choose a plan`,
      '1d': `🚨 Last day of your PayrollSaaS free trial`,
    };

    await sendEmail({
      to:       email,
      subject:  subjectMap[threshold],
      html:     generateReminderEmailHtml(orgName, daysLeft, trialEndDate, APP_URL.value()),
      from:     EMAIL_FROM.value(),
      smtpUser: EMAIL_SMTP_USER.value(),
      smtpPass: EMAIL_SMTP_PASS.value(),
    });

    // Mark this threshold as sent
    await db.collection('subscriptions').doc(uid).set(
      { emailNotificationsSent: admin.firestore.FieldValue.arrayUnion(threshold) },
      { merge: true },
    );

    console.log(`Trial reminder sent: uid=${uid} threshold=${threshold} daysLeft=${daysLeft}`);
    return { sent: true, threshold, daysLeft };
  },
);

// ─── scheduledTrialReminders ──────────────────────────────────────────────────
// Runs every day at 08:00 IST (02:30 UTC) to catch users who haven't logged in.
// Requires Firebase Blaze (pay-as-you-go) plan.
exports.scheduledTrialReminders = onSchedule(
  {
    schedule:  'every 24 hours',
    timeZone:  'Asia/Kolkata',
    secrets:   [EMAIL_FROM, EMAIL_SMTP_USER, EMAIL_SMTP_PASS],
  },
  async () => {
    const usersSnap = await db.collection('users').where('plan', '==', 'trial').get();
    const now = Date.now();

    for (const userDoc of usersSnap.docs) {
      try {
        const user      = userDoc.data();
        const uid       = userDoc.id;
        const createdAt = user.createdAt ? new Date(user.createdAt) : null;
        if (!createdAt || !user.email) continue;

        const daysElapsed = (now - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const daysLeft    = Math.ceil(TRIAL_DAYS - daysElapsed);

        let threshold = null;
        if (daysLeft <= 1)      threshold = '1d';
        else if (daysLeft <= 3) threshold = '3d';
        else if (daysLeft <= 7) threshold = '7d';

        if (!threshold) continue;

        const subSnap   = await db.collection('subscriptions').doc(uid).get();
        const sentList  = subSnap.exists ? (subSnap.data().emailNotificationsSent || []) : [];
        if (sentList.includes(threshold)) continue;

        const trialEndDate = formatDate(
          new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        );
        const subjectMap = {
          '7d': `⏰ Your PayrollSaaS trial ends in 7 days`,
          '3d': `⚠️ PayrollSaaS trial ends in 3 days — choose a plan`,
          '1d': `🚨 Last day of your PayrollSaaS free trial`,
        };

        await sendEmail({
          to:       user.email,
          subject:  subjectMap[threshold],
          html:     generateReminderEmailHtml(user.orgName || 'there', daysLeft, trialEndDate, APP_URL.value()),
          from:     EMAIL_FROM.value(),
          smtpUser: EMAIL_SMTP_USER.value(),
          smtpPass: EMAIL_SMTP_PASS.value(),
        });

        await db.collection('subscriptions').doc(uid).set(
          { emailNotificationsSent: admin.firestore.FieldValue.arrayUnion(threshold) },
          { merge: true },
        );

        console.log(`[scheduled] Reminder sent: uid=${uid} threshold=${threshold}`);
      } catch (err) {
        console.error(`[scheduled] Failed for uid=${userDoc.id}:`, err.message);
      }
    }
  },
);

// ─── createRazorpaySubscription ───────────────────────────────────────────────
exports.createRazorpaySubscription = onCall(
  {
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_STARTER, RAZORPAY_PLAN_PRO],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to upgrade your plan.');
    }

    const uid      = request.auth.uid;
    const { plan } = request.data;

    if (!plan || !['starter', 'pro'].includes(plan)) {
      throw new HttpsError('invalid-argument', 'Invalid plan. Choose starter or pro.');
    }

    const razorpayPlanId = getPlanId(
      plan,
      RAZORPAY_PLAN_STARTER.value(),
      RAZORPAY_PLAN_PRO.value(),
    );

    if (!razorpayPlanId) {
      throw new HttpsError('failed-precondition', `Razorpay Plan ID for "${plan}" is not configured.`);
    }

    const userRecord = await admin.auth().getUser(uid);
    const email      = userRecord.email || '';
    const name       = userRecord.displayName || email.split('@')[0] || 'Customer';

    const razorpay   = getRazorpayClient(RAZORPAY_KEY_ID.value(), RAZORPAY_KEY_SECRET.value());

    const subscription = await razorpay.subscriptions.create({
      plan_id:         razorpayPlanId,
      total_count:     120,
      quantity:        1,
      customer_notify: 1,
      notes: { uid, plan, email },
    });

    await db.collection('subscriptions').doc(uid).set(
      {
        plan,
        status:        'pending',
        razorpaySubId: subscription.id,
        pendingSince:  admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { subscriptionId: subscription.id, name, email };
  },
);

// ─── razorpayWebhook ──────────────────────────────────────────────────────────
exports.razorpayWebhook = onRequest(
  {
    secrets: [RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      res.status(400).send('Missing signature');
      return;
    }

    const rawBody      = JSON.stringify(req.body);
    const expectedSig  = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET.value())
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSig) {
      console.error('Razorpay webhook: invalid signature');
      res.status(400).send('Invalid signature');
      return;
    }

    const event     = req.body;
    const eventType = event.event;
    console.log('Razorpay webhook received:', eventType);

    try {
      if (eventType === 'subscription.activated' || eventType === 'subscription.charged') {
        await handleSubscriptionActivated(event.payload.subscription.entity, event.payload.payment?.entity);
      } else if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
        await handleSubscriptionEnded(event.payload.subscription.entity, 'cancelled');
      } else if (eventType === 'subscription.halted') {
        await handleSubscriptionEnded(event.payload.subscription.entity, 'halted');
      } else if (eventType === 'subscription.paused') {
        await handleSubscriptionEnded(event.payload.subscription.entity, 'paused');
      } else if (eventType === 'subscription.resumed') {
        await handleSubscriptionActivated(event.payload.subscription.entity, null);
      }
    } catch (err) {
      console.error('Error handling webhook event:', err);
    }

    res.status(200).json({ received: true });
  },
);

// ─── Subscription helpers ─────────────────────────────────────────────────────

async function handleSubscriptionActivated(subscription, payment) {
  const uid  = subscription.notes?.uid;
  const plan = subscription.notes?.plan;

  if (!uid || !plan) {
    console.error('handleSubscriptionActivated: missing uid or plan', subscription.notes);
    return;
  }

  const currentPeriodEnd = subscription.current_end
    ? new Date(subscription.current_end * 1000).toISOString()
    : null;

  const batch = db.batch();

  batch.set(
    db.collection('subscriptions').doc(uid),
    {
      plan,
      status:           'active',
      razorpaySubId:    subscription.id,
      currentPeriodEnd,
      activatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
      lastPaymentId:    payment?.id || null,
    },
    { merge: true },
  );

  batch.set(
    db.collection('users').doc(uid),
    { plan, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );

  await batch.commit();
  console.log(`Plan activated: uid=${uid} plan=${plan}`);
}

async function handleSubscriptionEnded(subscription, status) {
  const uid = subscription.notes?.uid;

  if (!uid) {
    console.error('handleSubscriptionEnded: missing uid', subscription.notes);
    return;
  }

  const batch = db.batch();

  batch.set(
    db.collection('subscriptions').doc(uid),
    {
      status,
      razorpaySubId: subscription.id,
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (status === 'cancelled' || status === 'expired') {
    batch.set(
      db.collection('users').doc(uid),
      { plan: 'free', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  await batch.commit();
  console.log(`Subscription ${status}: uid=${uid}`);
}
