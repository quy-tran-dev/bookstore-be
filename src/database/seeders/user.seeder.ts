import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

export const seedUsers = async (dataSource: DataSource) => {
  console.log('\n Đang reset seed Users...');
  const userRepository = dataSource.getRepository(User);
  
  // 1. Reset dữ liệu: Dùng CASCADE để ép xóa sạch kể cả khi có khóa ngoại
  await dataSource.query(`TRUNCATE TABLE "users" CASCADE`);
  console.log('\n Đang tạo dữ liệu Users...');

  // 2. Tạo dữ liệu mới
  const defaultPassword = await bcrypt.hash('123456', 10);
  const usersData : any = [
    {
      email: 'admin@bookstore.com',
      password: defaultPassword,
      role: 'ADMIN',
      isVerified: true,
      userDetail: { fullName: 'Admin Quản Trị', phone: '0999999999' },
    },
    {
      email: 'customer1@bookstore.com',
      password: defaultPassword,
      role: 'CUSTOMER',
      isVerified: true,
      userDetail: { fullName: 'Khách Hàng Một', phone: '0988888881' },
    },
    {
      email: 'customer2@bookstore.com',
      password: defaultPassword,
      role: 'CUSTOMER',
      isVerified: true,
      userDetail: { fullName: 'Khách Hàng Hai', phone: '0988888882' },
    },
  ];

  for (const u of usersData) {
    await userRepository.save(userRepository.create(u));
  }
  
  console.log(' Seed Users thành công!');
};