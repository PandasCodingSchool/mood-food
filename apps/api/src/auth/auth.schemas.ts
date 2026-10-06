import { z } from 'zod';

const str = (msg: string) => z.string({ error: msg });

export const phoneBody = z.object({ phone: str('Valid phone number is required') });

/** Stored and compared lowercased, so sign-in is case-insensitive. */
const email = str('Valid email is required').trim().toLowerCase().max(255).pipe(z.email('Valid email is required'));
const hasAccount = (b: { phone?: string; email?: string }) => !!(b.phone || b.email);
const accountRequired = { error: 'Email or phone number is required', path: ['email'] };

/** Sign up with an email, a phone number, or both. */
export const signupBody = z
  .object({
    name: str('Name is required').trim().min(1, 'Name is required').max(100),
    phone: str('Valid phone number is required').optional(),
    email: email.optional(),
    password: str('Password must be at least 6 characters').min(6, 'Password must be at least 6 characters').max(200),
  })
  .refine(hasAccount, accountRequired);

/** Email or phone, plus password. Email wins if both are sent. */
export const loginBody = z
  .object({
    phone: str('Valid phone number is required').optional(),
    email: email.optional(),
    password: str('Password is required').min(1, 'Password is required'),
  })
  .refine(hasAccount, accountRequired);

const otp = str('6-digit OTP is required').trim().regex(/^\d{6}$/, '6-digit OTP is required');

export const otpVerifyBody = z.object({
  phone: str('Valid phone number is required'),
  otp,
  name: z.string().trim().max(100).optional(),
});

export const emailBody = z.object({ email });

export const emailVerifyBody = z.object({ otp });

/** Forgot password: the code went to the phone (SMS) or the email (Resend). */
export const passwordResetBody = z
  .object({
    phone: str('Valid phone number is required').optional(),
    email: email.optional(),
    otp,
    password: signupBody.shape.password,
  })
  .refine(hasAccount, accountRequired);

export const passwordChangeBody = z.object({
  currentPassword: z.string().optional(),
  newPassword: signupBody.shape.password,
});

export type SignupBody = z.infer<typeof signupBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBody>;
export type EmailVerifyBody = z.infer<typeof emailVerifyBody>;
export type PasswordResetBody = z.infer<typeof passwordResetBody>;
export type PasswordChangeBody = z.infer<typeof passwordChangeBody>;
