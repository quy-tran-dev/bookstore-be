import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as qs from 'qs';

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);

  constructor(private readonly configService: ConfigService) {}

  // Format ngày giờ theo chuẩn VNPAY: YYYYMMDDHHmmss (Múi giờ GMT+7)
  public formatVnpayDate(date: Date = new Date()): string {
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const vnTime = new Date(utc + 3600000 * 7);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = vnTime.getFullYear();
    const month = pad(vnTime.getMonth() + 1);
    const day = pad(vnTime.getDate());
    const hours = pad(vnTime.getHours());
    const minutes = pad(vnTime.getMinutes());
    const seconds = pad(vnTime.getSeconds());
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  // Sắp xếp các tham số theo thứ tự Alphabet (A-Z) chuẩn VNPAY
  private sortObject(obj: Record<string, any>): Record<string, string> {
    const sorted: Record<string, string> = {};
    const str: string[] = [];
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        str.push(encodeURIComponent(key));
      }
    }
    str.sort();
    for (let key = 0; key < str.length; key++) {
      const currentKey = str[key];
      const val = obj[currentKey];
      if (val !== undefined && val !== null && val !== '') {
        sorted[currentKey] = encodeURIComponent(String(val)).replace(
          /%20/g,
          '+',
        );
      }
    }
    return sorted;
  }

  // Sinh URL thanh toán VNPAY
  public buildPaymentUrl(
    order: { code?: string; finalAmount?: number },
    ipAddr: string,
    bankCode?: string,
    locale: string = 'vn',
  ): string {
    const tmnCode =
      this.configService.get<string>('VNPAY_TMN_CODE') || 'FW8G5HR8';
    const secretKey =
      this.configService.get<string>('VNPAY_HASH_SECRET') ||
      'JKOUZZXGUEDPQFQZCVFVVCBRXYPNZOOB';
    const vnpUrl =
      this.configService.get<string>('VNPAY_URL') ||
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const returnUrl =
      this.configService.get<string>('VNPAY_RETURN_URL') ||
      'http://localhost:1234/apis/v1/payment/vnpay/return';

    const createDate = this.formatVnpayDate();
    const amount = Math.round(Number(order.finalAmount || 0) * 100);

    let vnpParams: Record<string, any> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: locale || 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: order.code,
      vnp_OrderInfo: `Thanh toan don hang ${order.code}`,
      vnp_OrderType: 'other',
      vnp_Amount: amount,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
    };

    if (bankCode) {
      vnpParams.vnp_BankCode = bankCode;
    }

    vnpParams = this.sortObject(vnpParams);

    const signData = qs.stringify(vnpParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    vnpParams['vnp_SecureHash'] = signed;

    const paymentUrl = `${vnpUrl}?${qs.stringify(vnpParams, { encode: false })}`;
    this.logger.log(`Tạo URL VNPAY cho đơn hàng ${order.code} thành công`);
    return paymentUrl;
  }

  // Xác thực chữ ký dữ liệu phản hồi (IPN & Return URL)
  public verifyChecksum(query: Record<string, any>): {
    isValid: boolean;
    data: Record<string, any>;
  } {
    const secretKey =
      this.configService.get<string>('VNPAY_HASH_SECRET') ||
      'JKOUZZXGUEDPQFQZCVFVVCBRXYPNZOOB';
    const vnpParams = { ...query };
    const secureHash = vnpParams['vnp_SecureHash'];

    delete vnpParams['vnp_SecureHash'];
    delete vnpParams['vnp_SecureHashType'];

    const sortedParams = this.sortObject(vnpParams);
    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const isValid = secureHash === signed;
    if (!isValid) {
      this.logger.warn(
        `Sai checksum VNPAY: Nhận được [${secureHash}], tính toán [${signed}]`,
      );
    }
    return { isValid, data: vnpParams };
  }
}
