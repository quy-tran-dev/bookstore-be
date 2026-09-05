import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import { ConfigService } from '@nestjs/config';
import { ClassSerializerInterceptor, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { TransformResponseInterceptor } from './common/interceptors/transform.interceptor';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<string>('PORT') || 4000;
  const nodeEnv = configService.get<string>('NODE_ENV');

  // Xử lý CORS Whitelist từ .env
  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') || [
    'http://localhost:3000',
  ];

  app.setGlobalPrefix('apis');
  app.use(helmet());
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.use(compression());
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Áp dụng mảng domain cho CORS
  app.enableCors({
    origin: corsOrigins,
    credentials: true, // Bắt buộc true để Frontend gửi được HTTP-Only Cookie
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.listen(port).then(async () => {
    const url = await app.getUrl();
    logger.debug(`Your app is running on port ${port}`);
    logger.debug(`Environment: ${nodeEnv}`);
    logger.debug(`Allowed CORS Origins: ${corsOrigins.join(', ')}`);
  });
}
bootstrap();
