import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, any>
{
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) =>
        data && data.data && data.pagination
          ? {
              statusCode: context.switchToHttp().getResponse().statusCode,
              message: data.message || 'Thành công',
              data: data.data,
              pagination: data.pagination,
            }
          : {
              statusCode: context.switchToHttp().getResponse().statusCode,
              message: data.message || 'Thành công',
              data,
            },
      ),
    );
  }
}
