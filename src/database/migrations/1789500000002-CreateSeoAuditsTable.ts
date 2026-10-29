import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSeoAuditsTable1789500000002 implements MigrationInterface {
  name = 'CreateSeoAuditsTable1789500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "seo_audits" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "create_by" uuid,
        "update_by" uuid,
        "delete_by" uuid,
        "product_id" uuid NOT NULL,
        "focus_keyword" character varying(255),
        "total_score" integer NOT NULL DEFAULT 0,
        "grade" character varying(50) NOT NULL DEFAULT 'AVERAGE',
        "audited_version" integer NOT NULL DEFAULT 1,
        "summary" text,
        "checklist" jsonb NOT NULL,
        "section_feedbacks" jsonb,
        "actionable_guidance" jsonb,
        CONSTRAINT "PK_seo_audits_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_seo_audits_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_seo_audits_product_id_created_at"
      ON "seo_audits" ("product_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_seo_audits_product_id_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seo_audits"`);
  }
}
