import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as compression from 'compression';
import { ConfigService } from '@nestjs/config';
import { Logger, VersioningType } from '@nestjs/common';
import { TransformResponseInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get<ConfigService>(ConfigService);
  const port = configService.get<string>('PORT') || 3000;
  const nodeEnv = configService.get<string>('NODE_ENV');

  // Config global
  app.setGlobalPrefix('apis');

  app.use(helmet());
  app.useGlobalInterceptors(new TransformResponseInterceptor());

  app.use(compression());

  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.listen(port).then(async () => {
    const url = await app.getUrl();
    logger.debug(`Your app is running on port ${port}`);
    logger.debug(`Environment: ${nodeEnv}`);
    logger.debug(`Documentation ${url}/docs`);
  });
}
bootstrap();
