import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { users } from './data/users.json';


export const seedUsers = async (dataSource: DataSource) => {
  console.log('\n Đang reset seed Users...');
  const userRepository = dataSource.getRepository(User);
  
  // 1. Reset dữ liệu: Dùng CASCADE để ép xóa sạch kể cả khi có khóa ngoại
  await dataSource.query(`TRUNCATE TABLE "users" CASCADE`);
  console.log('\n Đang tạo dữ liệu Users...');

  // 2. Tạo dữ liệu mới
  const defaultPassword = await bcrypt.hash('123456', 10);
  const usersData = users;

  for (const u of usersData) {
    u.password = defaultPassword;
    await userRepository.save(userRepository.create(u as any));
  }
  
  console.log(' Seed Users thành công!');
};