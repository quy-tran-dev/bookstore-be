import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserDetail } from './entities/user-detail.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserDetail])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Phải export ra để AuthModule xài
})
export class UsersModule {}