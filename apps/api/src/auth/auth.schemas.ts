import { z } from 'zod';

const str = (msg: string) => z.string({ error: msg });

export const phoneBody = z.object({ phone: str('Valid phone number is required') });

export const signupBody = z.object({
  name: str('Name is required').trim().min(1, 'Name is required').max(100),
  phone: str('Valid phone number is required'),
  password: str('Password must be at least 6 characters').min(6, 'Password must be at least 6 characters').max(200),
});

export const loginBody = z.object({
  phone: str('Valid phone number is required'),
  password: str('Password is required').min(1, 'Password is required'),
});

const otp = str('6-digit OTP is required').trim().regex(/^\d{6}$/, '6-digit OTP is required');

export const otpVerifyBody = z.object({
  phone: str('Valid phone number is required'),
  otp,
  name: z.string().trim().max(100).optional(),
});

export const passwordResetBody = z.object({
  phone: str('Valid phone number is required'),
  otp,
  password: signupBody.shape.password,
});

export const passwordChangeBody = z.object({
  currentPassword: z.string().optional(),
  newPassword: signupBody.shape.password,
});

export type SignupBody = z.infer<typeof signupBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBody>;
export type PasswordResetBody = z.infer<typeof passwordResetBody>;
export type PasswordChangeBody = z.infer<typeof passwordChangeBody>;
