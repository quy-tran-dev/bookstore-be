import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVersionAndLastModifiedToBookDetails1789500000001 implements MigrationInterface {
    name = 'AddVersionAndLastModifiedToBookDetails1789500000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "book_details" ADD "version" integer NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE "book_details" ADD "lastModifiedBy" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "book_details" DROP COLUMN "lastModifiedBy"`);
        await queryRunner.query(`ALTER TABLE "book_details" DROP COLUMN "version"`);
    }
}
