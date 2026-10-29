import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSectionsToBookDetailsTable1789500000000 implements MigrationInterface {
    name = 'AddSectionsToBookDetailsTable1789500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "book_details" ADD "sections" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "book_details" DROP COLUMN "sections"`);
    }
}
