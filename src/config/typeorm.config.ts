import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const typeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get('DB_HOST'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get('DB_USERNAME'),
  password: configService.get('DB_PASSWORD'),
  database: configService.get('DB_DATABASE'),

  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  autoLoadEntities: true,

  synchronize: configService.get('NODE_ENV') === 'dev',
  logging: ['query', 'error', 'schema'],
});