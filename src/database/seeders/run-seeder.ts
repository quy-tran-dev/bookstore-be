import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedUsers } from './user.seeder';
import {
  seedCategories,
  seedAuthors,
  seedProducts,
} from './product.seeder';
import { seedOrders } from './order.seeder';

export type SeederTarget =
  | 'all'
  | 'users'
  | 'categories'
  | 'authors'
  | 'books'
  | 'products'
  | 'orders';

export interface SeederCliOptions {
  targets: SeederTarget[];
  fresh: boolean;
  count: number;
  months: number;
  runMigrations: boolean;
}

/**
 * Phân tích các cờ dòng lệnh (CLI Flags) cho Seeder:
 * - --target=all|users|categories|authors|books|products|orders (hỗ trợ nhiều target cách nhau dấu phẩy)
 * - --fresh hoặc -f: Xóa trắng dữ liệu trước khi seed (Mặc định: false - an toàn tuyệt đối)
 * - --count=N: Số lượng đơn hàng muốn sinh thêm (Mặc định: 180)
 * - --months=M: Số tháng phân bổ đơn hàng lùi về quá khứ (Mặc định: 6)
 * - --migrate: Chạy các migration còn thiếu trước khi seed (Mặc định: false)
 */
export function parseSeederCliArgs(
  argv: string[] = process.argv.slice(2),
): SeederCliOptions {
  const validTargets = new Set<SeederTarget>([
    'all',
    'users',
    'categories',
    'authors',
    'books',
    'products',
    'orders',
  ]);

  let targets: SeederTarget[] = ['all'];
  let fresh = false;
  let count = 180;
  let months = 6;
  let runMigrations = false;

  for (const rawArg of argv) {
    const arg = rawArg.trim();
    if (arg === '--fresh' || arg === '-f') {
      fresh = true;
    } else if (arg === '--migrate' || arg === '--run-migrations') {
      runMigrations = true;
    } else if (arg.startsWith('--target=') || arg.startsWith('--only=')) {
      const val = arg.split('=')[1] || '';
      const parsed = val
        .split(',')
        .map((t) => t.trim().toLowerCase() as SeederTarget)
        .filter((t) => validTargets.has(t));
      if (parsed.length > 0) {
        targets = parsed;
      }
    } else if (arg.startsWith('--count=')) {
      const parsedCount = Number(arg.split('=')[1]);
      if (!isNaN(parsedCount) && parsedCount > 0) {
        count = Math.floor(parsedCount);
      }
    } else if (arg.startsWith('--months=')) {
      const parsedMonths = Number(arg.split('=')[1]);
      if (!isNaN(parsedMonths) && parsedMonths > 0) {
        months = parsedMonths;
      }
    }
  }

  return {
    targets,
    fresh,
    count,
    months,
    runMigrations,
  };
}

/**
 * Điều phối chạy các Seeder theo đúng mục tiêu được chọn
 */
export async function executeMasterSeeder(
  dataSource: DataSource,
  app: INestApplicationContext | undefined,
  options: SeederCliOptions,
) {
  const targetSet = new Set<SeederTarget>(options.targets);
  const runAll = targetSet.has('all');

  console.log('\n======================================================');
  console.log(' 🚀 HỆ THỐNG SMART & INCREMENTAL SEEDER');
  console.log(
    ` 📌 Chế độ: ${
      options.fresh
        ? '⚠️ FRESH RESET (Xóa trắng dữ liệu cũ)'
        : '🛡️ SAFE INCREMENTAL / APPEND (Không xóa dữ liệu cũ)'
    }`,
  );
  console.log(` 🎯 Mục tiêu: ${options.targets.join(', ').toUpperCase()}`);
  if (runAll || targetSet.has('orders')) {
    console.log(
      ` 📦 Cấu hình Orders: Bổ sung +${options.count} đơn hàng trong ${options.months} tháng`,
    );
  }
  console.log('======================================================');

  if (options.runMigrations) {
    console.log('\n🔄 Đang kiểm tra và chạy các Migration chưa áp dụng...');
    const appliedMigrations = await dataSource.runMigrations();
    console.log(
      ` ✅ Đã áp dụng ${appliedMigrations.length} migration mới (không ảnh hưởng dữ liệu cũ).`,
    );
  }

  const summary: Record<string, any> = {};

  if (runAll || targetSet.has('users')) {
    summary.users = await seedUsers(dataSource, { fresh: options.fresh });
  }

  const wantsBooks =
    runAll || targetSet.has('books') || targetSet.has('products');

  if (wantsBooks) {
    // seedProducts tự động gọi seedCategories và seedAuthors theo chế độ gia tăng
    summary.books = await seedProducts(dataSource, app, {
      fresh: options.fresh,
    });
  } else {
    if (targetSet.has('categories')) {
      summary.categories = await seedCategories(dataSource);
    }
    if (targetSet.has('authors')) {
      summary.authors = await seedAuthors(dataSource);
    }
  }

  if (runAll || targetSet.has('orders')) {
    summary.orders = await seedOrders(dataSource, {
      fresh: options.fresh,
      count: options.count,
      months: options.months,
    });
  }

  console.log('\n🎉 HOÀN TẤT SEEDER THÀNH CÔNG!');
  return summary;
}

async function bootstrap() {
  const cliOptions = parseSeederCliArgs(process.argv.slice(2));
  const { AppModule } = await import('../../app.module');
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    await executeMasterSeeder(dataSource, app, cliOptions);
  } catch (error) {
    console.error('\n❌ Lỗi khi chạy Seeder:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
