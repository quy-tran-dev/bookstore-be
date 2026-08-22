import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetupAISearch1787140372501 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Bật extension Vector
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // 2. THÊM 2 CỘT NÀY VÀO TRƯỚC (Vì file Entity chỉ khai báo chứ chưa tạo trong DB)
    await queryRunner.query(
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_keywords text`,
    );
    await queryRunner.query(
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector(384)`,
    );

    // 3. Bây giờ mới tạo cột tsvector (đã có seo_keywords để dùng)
    await queryRunner.query(`
            ALTER TABLE products 
            ADD COLUMN document_with_weights tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(seo_keywords, '')), 'B')
            ) STORED;
        `);

    // 4. Đánh Index GIN cho Full-text search tăng tốc
    await queryRunner.query(`
            CREATE INDEX idx_products_fts ON products USING GIN (document_with_weights);
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xóa theo thứ tự ngược lại
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_fts`);
    await queryRunner.query(
      `ALTER TABLE products DROP COLUMN IF EXISTS document_with_weights`,
    );
    await queryRunner.query(
      `ALTER TABLE products DROP COLUMN IF EXISTS embedding`,
    );
    await queryRunner.query(
      `ALTER TABLE products DROP COLUMN IF EXISTS seo_keywords`,
    );
    await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
  }
}
