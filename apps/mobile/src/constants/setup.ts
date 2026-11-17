// Post-sign-in setup, shared by every way in. Screens read ?onboarding=<flow>:
//   email → new email account: verify email → taste & allergies → Swiggy → check-in
//   new   → new phone account or guest: taste & allergies → Swiggy → check-in
//   login → returning account without Swiggy: Swiggy → check-in
import type { Href } from 'expo-router';

export type SetupFlow = 'email' | 'new' | 'login';
export type SetupStep = 'verify-email' | 'preferences' | 'swiggy-connect';

const STEPS: Record<SetupFlow, SetupStep[]> = {
  email: ['verify-email', 'preferences', 'swiggy-connect'],
  new: ['preferences', 'swiggy-connect'],
  login: ['swiggy-connect'],
};

const CHECKIN: Href = { pathname: '/mood-checkin', params: { next: '/recommendations' } };

export const asSetupFlow = (v?: string): SetupFlow | null => (v && v in STEPS ? (v as SetupFlow) : null);

const href = (step: SetupStep, flow: SetupFlow): Href => ({ pathname: `/${step}`, params: { onboarding: flow } });

export const startSetup = (flow: SetupFlow): Href => href(STEPS[flow][0], flow);

export function nextSetupStep(step: SetupStep, flow: SetupFlow): Href {
  const steps = STEPS[flow];
  const i = steps.indexOf(step);
  return i >= 0 && i + 1 < steps.length ? href(steps[i + 1], flow) : CHECKIN;
}

export function setupStepLabel(step: SetupStep, flow: SetupFlow): string {
  const steps = STEPS[flow];
  return steps.length > 1 ? `Step ${steps.indexOf(step) + 1} of ${steps.length}` : 'One last step';
}
