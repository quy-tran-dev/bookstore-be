import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { users } from './data/users.json';

export interface SeedUsersOptions {
  fresh?: boolean;
  extraUsers?: Array<{
    email: string;
    password?: string;
    role?: string;
    isVerified?: boolean;
    userDetail?: { fullName: string; phone?: string };
  }>;
}

export const seedUsers = async (
  dataSource: DataSource,
  options?: SeedUsersOptions,
) => {
  const userRepository = dataSource.getRepository(User);
  const isFresh = options?.fresh === true;

  if (isFresh) {
    console.log('\n⚠️ [FRESH MODE] Đang xóa trắng bảng Users...');
    await dataSource.query(`TRUNCATE TABLE "users" CASCADE`);
  } else {
    console.log('\n🛡️ [SAFE INCREMENTAL] Đang kiểm tra và bổ sung Users (không xóa dữ liệu cũ)...');
  }

  // Lấy toàn bộ email đã tồn tại trong DB (kể cả đã xóa mềm để tránh đụng độ unique email constraint)
  const existingUsers = await userRepository.find({
    select: { id: true, email: true },
    withDeleted: true,
  });
  const existingEmails = new Set(
    existingUsers.map((u) => u.email.trim().toLowerCase()),
  );

  const defaultPassword = await bcrypt.hash('123456', 10);
  const usersData = [...users, ...(options?.extraUsers || [])];

  let createdCount = 0;
  let skippedCount = 0;

  for (const u of usersData) {
    const normalizedEmail = u.email.trim().toLowerCase();
    if (existingEmails.has(normalizedEmail)) {
      skippedCount++;
      console.log(` ⏭ Bỏ qua User "${u.email}" (Đã tồn tại)`);
      continue;
    }

    const hashedPassword =
      u.password && u.password !== '123456'
        ? await bcrypt.hash(u.password, 10)
        : defaultPassword;

    await userRepository.save(
      userRepository.create({
        ...u,
        email: u.email.trim(),
        password: hashedPassword,
      } as any),
    );
    existingEmails.add(normalizedEmail);
    createdCount++;
    console.log(` ✅ Đã thêm User mới: "${u.email}"`);
  }

  console.log(
    ` Hoàn tất Seed Users: Thêm mới ${createdCount}, Bỏ qua ${skippedCount} (Tổng trong DB: ${existingEmails.size}).`,
  );

  return {
    createdCount,
    skippedCount,
    totalInDatabase: existingEmails.size,
  };
};
