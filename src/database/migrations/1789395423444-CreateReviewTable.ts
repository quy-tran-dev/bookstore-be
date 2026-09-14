import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateReviewTable1789395423444 implements MigrationInterface {
    name = 'CreateReviewTable1789395423444'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "reviews" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "rating" integer NOT NULL, "title" character varying(255), "comment" text NOT NULL, "status" integer NOT NULL DEFAULT '1', "is_purchased" boolean NOT NULL DEFAULT false, "admin_reply" text, "admin_reply_at" TIMESTAMP WITH TIME ZONE, "product_id" uuid, "user_id" uuid, "order_id" uuid, CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5f1b745cf64a9861f328f5bc3f" ON "reviews"  ("deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_9482e9567d8dcc2bc615981ef4" ON "reviews"  ("product_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_728447781a30bc3fcfe5c2f1cd" ON "reviews"  ("user_id") `);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","document_with_weights","bookstore_db","public","products"]);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44"`);
        await queryRunner.query(`DROP TABLE "reviews"`);
    }

}
