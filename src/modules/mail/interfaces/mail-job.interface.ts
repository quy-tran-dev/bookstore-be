export interface MailJobData {
  to: string;
  userName: string;
  verificationToken?: string; // Dùng cho Welcome / Reset Password
  orderId?: string;           // Dùng cho module Books sau này
}