import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserDetail } from './entities/user-detail.entity';
import { UsersService } from './users.service';
import { AdminUsersController } from '@app/apis/v1/admin/user/admin-user.controller';
import { PublicUsersController } from '@app/apis/v1/public/user/public-user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserDetail])],
  controllers: [PublicUsersController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}