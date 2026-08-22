import { MigrationInterface, QueryRunner } from "typeorm";

export class DeleteImgInProductsAndCategoriesTable1786783339944 implements MigrationInterface {
    name = 'DeleteImgInProductsAndCategoriesTable1786783339944'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "imgUrl"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "img"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ADD "img" text`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "imgUrl" text`);
    }

}
