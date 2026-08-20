import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateSlugAndAvatarAuthor1787149458708 implements MigrationInterface {
    name = 'UpdateSlugAndAvatarAuthor1787149458708'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "authors" ADD "slug" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "authors" ADD "avatar_media_id" uuid`);
        await queryRunner.query(`ALTER TABLE "authors" ADD CONSTRAINT "UQ_77783709b3f755f8724e0b03078" UNIQUE ("avatar_media_id")`);
        await queryRunner.query(`ALTER TABLE "authors" ADD CONSTRAINT "FK_77783709b3f755f8724e0b03078" FOREIGN KEY ("avatar_media_id") REFERENCES "medias"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "authors" DROP CONSTRAINT "FK_77783709b3f755f8724e0b03078"`);
        await queryRunner.query(`ALTER TABLE "authors" DROP CONSTRAINT "UQ_77783709b3f755f8724e0b03078"`);
        await queryRunner.query(`ALTER TABLE "authors" DROP COLUMN "avatar_media_id"`);
        await queryRunner.query(`ALTER TABLE "authors" DROP COLUMN "slug"`);
    }
}