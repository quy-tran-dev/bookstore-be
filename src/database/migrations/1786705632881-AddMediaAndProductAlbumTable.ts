import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMediaAndProductAlbumTable1786705632881 implements MigrationInterface {
    name = 'AddMediaAndProductAlbumTable1786705632881'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "medias" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "folder_path" character varying(255) NOT NULL DEFAULT 'general', "file_name" character varying(255) NOT NULL, "file_url" text NOT NULL, "mime_type" character varying(100) NOT NULL, "size" integer NOT NULL DEFAULT '0', "provider" character varying(50) NOT NULL DEFAULT 'local', "alt_text" character varying(255), CONSTRAINT "PK_f27321557a66cd4fae9bc1ed6e7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ed21f2a7d7323e2c368e27c995" ON "medias"  ("deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_f9e2be44ca7136b9733aea8cec" ON "medias"  ("folder_path") `);
        await queryRunner.query(`CREATE TABLE "product_albums" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "display_order" integer NOT NULL DEFAULT '0', "product_id" uuid, "media_id" uuid, CONSTRAINT "PK_3de3cbc872819a47123990c2332" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_00731dd36c51873f4c034ebecd" ON "product_albums"  ("deleted_at") `);
        await queryRunner.query(`ALTER TABLE "product_albums" ADD CONSTRAINT "FK_3dffd6be7fbcbf520f37f91c8b2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_albums" ADD CONSTRAINT "FK_ac39d857b1417bce0d5bebf03a0" FOREIGN KEY ("media_id") REFERENCES "medias"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_albums" DROP CONSTRAINT "FK_ac39d857b1417bce0d5bebf03a0"`);
        await queryRunner.query(`ALTER TABLE "product_albums" DROP CONSTRAINT "FK_3dffd6be7fbcbf520f37f91c8b2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_00731dd36c51873f4c034ebecd"`);
        await queryRunner.query(`DROP TABLE "product_albums"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f9e2be44ca7136b9733aea8cec"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ed21f2a7d7323e2c368e27c995"`);
        await queryRunner.query(`DROP TABLE "medias"`);
    }

}
