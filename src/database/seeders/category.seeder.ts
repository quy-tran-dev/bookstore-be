import { DataSource } from 'typeorm';
import { Category } from '../../modules/categories/entities/category.entity';
import { SlugUtil } from '../../common/utils/slug.util';
import { StatusCategory } from '@app/common/enums/status-category.enum';

export const seedCategories = async (dataSource: DataSource) => {
  console.log('\n Đang reset seed Categories...');
  const categoryRepository = dataSource.getRepository(Category);

  // 1. Reset dữ liệu
  await dataSource.query(`TRUNCATE TABLE "categories" CASCADE`);
  console.log('\n Đang tạo dữ liệu Categories...');

  // 2. Helper tạo category
  const createCat = async (name: string, parentId?: string) => {
    const slug = SlugUtil.generate(name);
    return await categoryRepository.save(
      categoryRepository.create({
        name,
        slug,
        parentId,
        isVerified: true,
        status: StatusCategory.ACTIVE,
      }),
    );
  };

  // --- TẦNG GỐC (Cha) ---
  const vanHoc = await createCat('Sách Văn Học');
  const kinhTe = await createCat('Sách Kinh Tế');
  const kyNang = await createCat('Sách Kỹ Năng');
  const thieuNhi = await createCat('Sách Thiếu Nhi');

  // --- TẦNG 2 (Con) ---
  await createCat('Tiểu Thuyết', vanHoc.id);
  await createCat('Truyện Ngắn', vanHoc.id);
  await createCat('Thơ Ca', vanHoc.id);

  await createCat('Quản Trị Kinh Doanh', kinhTe.id);
  await createCat('Marketing & Bán Hàng', kinhTe.id);

  await createCat('Kỹ Năng Sống', kyNang.id);

  console.log(' Seed Categories thành công!');
};
