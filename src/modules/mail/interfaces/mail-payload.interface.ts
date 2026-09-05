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

export interface OrderItemPayload {
  name: string;
  quantity: number;
  price: string; 
}

export interface MailOrderConfirmationPayload {
  to: string;
  username: string;
  order_id: string;
  order_date: string;
  total_amount: string;
  shipping_address: string;
  items: OrderItemPayload[];
  order_tracking_link?: string;
}