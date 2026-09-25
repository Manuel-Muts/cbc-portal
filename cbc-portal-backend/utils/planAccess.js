export const SCHOOL_PLANS = ['basic', 'standard', 'premium'];

export const DEFAULT_SCHOOL_PLAN = 'basic';

export const PLAN_FEATURES = {
  basic: {
    communication: false,
    timetable: false,
    finance: false,
    deanAnalysis: true,
    marks: true,
    userManagement: true,
    academics: true,
    reports: true,
  },
  standard: {
    communication: true,
    timetable: true,
    finance: false,
    deanAnalysis: true,
    marks: true,
    userManagement: true,
    academics: true,
    reports: true,
  },
  premium: {
    communication: true,
    timetable: true,
    finance: true,
    deanAnalysis: true,
    marks: true,
    userManagement: true,
    academics: true,
    reports: true,
  }
};

export const normalizePlan = (plan) => {
  const normalized = String(plan || DEFAULT_SCHOOL_PLAN).trim().toLowerCase();
  return SCHOOL_PLANS.includes(normalized) ? normalized : DEFAULT_SCHOOL_PLAN;
};

export const getPlanFeatures = (plan) => ({
  ...PLAN_FEATURES[normalizePlan(plan)]
});

export const isFeatureEnabledForPlan = (plan, feature) => {
  const normalizedPlan = normalizePlan(plan);
  return Boolean(getPlanFeatures(normalizedPlan)[feature]);
};

export const buildPlanFeatureSet = (plan, overrides = {}) => {
  const baseFeatures = getPlanFeatures(plan);
  return { ...baseFeatures, ...overrides };
};
