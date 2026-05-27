export const TRIAL_DAYS = 30;

export const PLANS = {
  trial: {
    label: 'Free Trial',
    price: 0,
    priceLabel: `Free for ${TRIAL_DAYS} days`,
    employees: Infinity,
    firms: Infinity,
    teamMembers: Infinity,
    features: [
      `${TRIAL_DAYS}-day free trial`,
      'Unlimited employees & firms',
      'All features unlocked',
      'No credit card required',
    ],
    badge: 'Trial',
    razorpayPlanEnvKey: null,
  },
  starter: {
    label: 'Starter',
    price: 30,
    priceLabel: '₹30 / employee / month',
    employees: Infinity,
    firms: 1,
    teamMembers: 3,
    features: [
      '₹30 per employee / month',
      '1 firm / branch',
      '3 team members / users',
      'Attendance tracking',
      'Excel & PDF export',
      'Payroll computation',
    ],
    badge: null,
    razorpayPlanEnvKey: 'VITE_RAZORPAY_PLAN_STARTER',
  },
  pro: {
    label: 'Pro',
    price: 40,
    priceLabel: '₹40 / employee / month',
    employees: Infinity,
    firms: 3,
    teamMembers: 5,
    features: [
      '₹40 per employee / month',
      '3 firms / branches',
      '5 team members / users',
      'Everything in Starter',
      'Employee documents vault',
      'Priority support',
    ],
    badge: 'Popular',
    razorpayPlanEnvKey: 'VITE_RAZORPAY_PLAN_PRO',
  },
  enterprise: {
    label: 'Enterprise',
    price: 79,
    priceLabel: '₹79 / employee / month',
    employees: Infinity,
    firms: Infinity,
    teamMembers: Infinity,
    features: [
      '₹79 per employee / month',
      'Unlimited firms / branches',
      'Unlimited team members',
      'Everything in Pro',
      'Dedicated support & custom SLA',
    ],
    badge: null,
    razorpayPlanEnvKey: null,
  },
  // Legacy plan — users created before the new pricing rollout
  free: {
    label: 'Free',
    price: 0,
    priceLabel: '₹0 / month',
    employees: 10,
    firms: 1,
    teamMembers: 1,
    features: ['Legacy free plan'],
    badge: null,
    razorpayPlanEnvKey: null,
  },
};

export const PLAN_ORDER = ['trial', 'starter', 'pro', 'enterprise'];
export const PAID_PLANS = ['starter', 'pro', 'enterprise'];

export function getPlanLimits(plan) {
  return PLANS[plan] || PLANS.starter;
}

export function isHigherPlan(a, b) {
  return PLAN_ORDER.indexOf(a) > PLAN_ORDER.indexOf(b);
}

export function canAddEmployee(plan, currentCount) {
  return currentCount < getPlanLimits(plan).employees;
}

export function canAddFirm(plan, currentCount) {
  return currentCount < getPlanLimits(plan).firms;
}

export function canAddTeamMember(plan, currentCount) {
  return currentCount < getPlanLimits(plan).teamMembers;
}

export function getNextPlan(plan) {
  const idx = PLAN_ORDER.indexOf(plan);
  return PLAN_ORDER[idx + 1] || 'enterprise';
}

export function getUpgradeMessage(plan, resource) {
  const next = getNextPlan(plan);
  const nextLabel = PLANS[next]?.label || 'a higher plan';
  return `You've reached the ${resource} limit on the ${PLANS[plan]?.label || plan} plan. Upgrade to ${nextLabel} to add more.`;
}

export function getTrialDaysLeft(createdAt) {
  if (!createdAt) return 0;
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const daysElapsed = elapsed / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - daysElapsed));
}

export function isTrialExpired(plan, createdAt) {
  return plan === 'trial' && getTrialDaysLeft(createdAt) === 0;
}
