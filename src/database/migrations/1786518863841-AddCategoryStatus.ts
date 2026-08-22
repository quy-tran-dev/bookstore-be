import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryStatus1786518863841 implements MigrationInterface {
    name = 'AddCategoryStatus1786518863841'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" ADD "isVerified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "status" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "isVerified"`);
    }

}
