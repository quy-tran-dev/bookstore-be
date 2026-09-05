import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'notifications', // Tách namespace riêng
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server?: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Lấy token từ header hoặc auth payload
      let token =
        client.handshake.auth?.token ||
        client.handshake.headers['authorization'] ||
        (client.handshake.query?.token as string);
      if (token && token.startsWith('Bearer ')) {
        token = token.split(' ')[1];
      }

      if (!token) {
        this.logger.warn(`Client ${client.id} kết nối nhưng KHÔNG CÓ TOKEN`);
        client.disconnect();
        return;
      }

      // Đảm bảo JWT_SECRET khớp với bên AuthModule
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'secretKey', 
      });

      const userId = payload.sub || payload.id;
      const role = payload.role;

      // Cho Admin vào phòng riêng
      if (role === 'ADMIN') {
        client.join('admin_room');
        this.logger.log(`Admin kết nối Socket: ${client.id}`);
      }

      // Cho User vào phòng của chính họ
      if (userId) {
        client.join(`user_${userId}`);
      }
    } catch (error) {
      this.logger.error(`❌ [Socket] Lỗi giải mã Token: ${error}`);
      client.disconnect(); // Token sai -> đá ra ngay
    }
  }

  handleDisconnect(client: Socket) {
    // Xử lý khi client ngắt kết nối
  }

  // --- CÁC HÀM PHÁT TÍN HIỆU ---

  notifyAdminNewOrder(order: any) {
    this.server?.to('admin_room').emit('new_order', {
      message: 'Có đơn hàng mới!',
      orderCode: order.code,
    });
  }

  notifyUserOrderStatus(userId: string, order: any) {
    this.server?.to(`user_${userId}`).emit('order_status_updated', {
      message: `Đơn hàng ${order.code} đã cập nhật trạng thái: ${order.status}`,
      status: order.status,
    });
  }
}
