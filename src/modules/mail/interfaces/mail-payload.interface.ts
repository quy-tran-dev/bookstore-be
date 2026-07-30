export interface MailWelcomePayload {
  to: string;
  fullName: string;
  verifyToken: string;
}

export interface MailResetPwdPayload {
  to: string;
  fullName: string;
  resetToken: string;
}