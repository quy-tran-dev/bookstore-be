import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DataSource } from 'typeorm';
import { seedUsers } from './user.seeder';
import { seedCategories } from './category.seeder';
import { seedProducts } from './product.seeder';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  // Lấy thẳng kết nối Database gốc từ TypeORM
  const dataSource = app.get(DataSource); 

  console.log('\n BẮT ĐẦU CHẠY MASTER SEEDER...');

  try {
    // Chạy theo thứ tự quy định
    await seedUsers(dataSource);
    await seedCategories(dataSource);
    await seedProducts(dataSource); // <- Sau này add thêm vào đây
    
    console.log('\n HOÀN TẤT TOÀN BỘ SEEDER!');
  } catch (error) {
    console.error('\n Lỗi khi chạy Seeder:', error);
  } finally {
    // Luôn nhớ đóng kết nối khi xong việc
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});