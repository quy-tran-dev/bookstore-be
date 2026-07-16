import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const responseData = data?.data !== undefined ? data.data : data;
        const pagination = data?.pagination;
        
        return {
          statusCode: context.switchToHttp().getResponse().statusCode,
          message: data?.message || 'Thành công',
          data: responseData,
          ...(pagination && { pagination }),
        };
      }),
    );
  }
}