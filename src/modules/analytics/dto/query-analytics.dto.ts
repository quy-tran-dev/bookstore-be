import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum AnalyticsPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export class QueryAnalyticsDto {
  @IsEnum(AnalyticsPeriod, {
    message: 'Period phải là một trong các giá trị: day, week, month, year',
  })
  @IsOptional()
  period?: AnalyticsPeriod = AnalyticsPeriod.MONTH;

  @IsString({ message: 'startDate phải là chuỗi ngày định dạng YYYY-MM-DD' })
  @IsOptional()
  startDate?: string;

  @IsString({ message: 'endDate phải là chuỗi ngày định dạng YYYY-MM-DD' })
  @IsOptional()
  endDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 10;
}
