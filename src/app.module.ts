import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { providers } from './app.provider';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { dataSourceOptions } from './database/data-source';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BullModule } from '@nestjs/bull';
import { BullConfigService } from './config/bull.config';
import { MailModule } from './modules/mail/mail.module';
import { DiscordModule } from './modules/discord/discord.module';
import { CategoriesModule } from './modules/categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    BullModule.forRootAsync({
      useClass: BullConfigService,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    DiscordModule,
    MailModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
  ],
  controllers: [AppController],
  providers,
})
export class AppModule {}
