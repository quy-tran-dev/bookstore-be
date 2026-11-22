import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMinSize,
  ArrayMaxSize,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO tham số truy vấn cho API gợi ý sách tương tự và gợi ý cá nhân hóa
 */
export class RecommendationQueryDto {
  // Số lượng sách gợi ý tối đa muốn lấy (mặc định: 6, giới hạn từ 1 đến 12 cuốn)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Số lượng sách gợi ý tối thiểu là 1' })
  @Max(12, { message: 'Số lượng sách gợi ý tối đa là 12' })
  limit?: number = 6;

  // Ngưỡng điểm tương đồng ngữ nghĩa tối thiểu [0.30 - 0.95] (mặc định: 0.60 tương ứng 60% tương đồng)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.3, { message: 'Ngưỡng tương đồng tối thiểu không được nhỏ hơn 0.30' })
  @Max(0.95, { message: 'Ngưỡng tương đồng tối thiểu không được vượt quá 0.95' })
  minSimilarity?: number = 0.6;
}

/**
 * DTO nhận danh sách ID sách đang có trong giỏ hàng để gợi ý sách mua kèm (Cross-selling)
 */
export class CartComplementaryDto {
  @IsArray({ message: 'productIds phải là một mảng danh sách ID sách' })
  @ArrayMinSize(1, { message: 'Giỏ hàng cần có ít nhất 1 sản phẩm để gợi ý' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 sản phẩm trong một lần phân tích giỏ hàng' })
  @IsString({ each: true, message: 'Mỗi productId phải là một chuỗi UUID hợp lệ' })
  productIds!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  limit?: number = 6;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.3)
  @Max(0.95)
  minSimilarity?: number = 0.6;
}
