export enum OrderStatus {
  PENDING = 'PENDING',       // Vừa đặt hàng, chờ Admin xác nhận
  CONFIRMED = 'CONFIRMED',   // Admin đã xác nhận, đang chuẩn bị hàng
  SHIPPING = 'SHIPPING',     // Đang giao cho đơn vị vận chuyển
  COMPLETED = 'COMPLETED',   // Khách đã nhận hàng thành công
  CANCELLED = 'CANCELLED',   // Đơn hàng bị hủy (khách hủy hoặc shop hủy)
  REFUNDED = 'REFUNDED',     // Khách trả hàng, đã hoàn tiền
}