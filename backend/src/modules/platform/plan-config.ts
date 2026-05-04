/**
 * plan-config.ts — Maps plan names to resource limits.
 * Used by tenant-limits middleware to enforce per-tenant quotas.
 */

export interface PlanLimits {
  maxZalo: number;
  maxUsers: number;
  maxContacts: number;
  aiEnabled: boolean;
  aiMaxDaily: number;  // max AI calls per day (0 = disabled)
}

export const PLAN_CONFIGS: Record<string, PlanLimits> = {
  trial: {
    maxZalo: 2,
    maxUsers: 3,
    maxContacts: 100,
    aiEnabled: false,
    aiMaxDaily: 0,
  },
  basic_10: {
    maxZalo: 10,
    maxUsers: 10,
    maxContacts: 2000,
    aiEnabled: false,
    aiMaxDaily: 0,
  },
  basic_10_ai: {
    maxZalo: 10,
    maxUsers: 10,
    maxContacts: 2000,
    aiEnabled: true,
    aiMaxDaily: 100,
  },
  pro_30: {
    maxZalo: 30,
    maxUsers: 30,
    maxContacts: 10000,
    aiEnabled: false,
    aiMaxDaily: 0,
  },
  pro_30_ai: {
    maxZalo: 30,
    maxUsers: 30,
    maxContacts: 10000,
    aiEnabled: true,
    aiMaxDaily: 500,
  },
  enterprise: {
    maxZalo: 999,
    maxUsers: 999,
    maxContacts: 999999,
    aiEnabled: false,
    aiMaxDaily: 0,
  },
  enterprise_ai: {
    maxZalo: 999,
    maxUsers: 999,
    maxContacts: 999999,
    aiEnabled: true,
    aiMaxDaily: 9999,
  },
};

/** Get limits for a plan, fallback to trial if unknown */
export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_CONFIGS[plan] || PLAN_CONFIGS.trial;
}

/** All available plan names */
export const PLAN_NAMES = Object.keys(PLAN_CONFIGS);
