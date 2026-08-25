import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveEmbeddingVetorProductsTable1787644738658 implements MigrationInterface {
    name = 'RemoveEmbeddingVetorProductsTable1787644738658'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // CHỈ GIỮ LẠI LỆNH DROP COLUMN NÀY
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "embeddingVector"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // TRẢ LẠI TRẠNG THÁI CŨ KHI DOWN
        await queryRunner.query(`ALTER TABLE "products" ADD "embeddingVector" vector(768)`);
    }
}