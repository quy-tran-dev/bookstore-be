import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCategoriesTable1786098840685 implements MigrationInterface {
    name = 'CreateCategoriesTable1786098840685'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "imgUrl" text, "parent_id" uuid, CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a184f5dd6c131f01b9f48968f0" ON "categories"  ("deleted_at") `);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a184f5dd6c131f01b9f48968f0"`);
        await queryRunner.query(`DROP TABLE "categories"`);
    }

}
