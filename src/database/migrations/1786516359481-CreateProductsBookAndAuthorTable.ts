import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProductsBookAndAuthorTable1786516359481 implements MigrationInterface {
    name = 'CreateProductsBookAndAuthorTable1786516359481'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "book_details" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "title" character varying(255), "describe" text, "publisher" character varying(255), "publishYear" integer, "language" character varying(100), "format" character varying(100), "pageCount" integer, "product_id" uuid, CONSTRAINT "REL_33d67ea81e1ce8cac22dd5deec" UNIQUE ("product_id"), CONSTRAINT "PK_c9d2a9a2fc584b177101858e633" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_89c4679eb14987f71167cd9b27" ON "book_details"  ("deleted_at") `);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "img" text, "shortDescribe" text, "embeddingVector" vector(768), "cost" numeric(12,2) NOT NULL DEFAULT '0', "price" numeric(12,2) NOT NULL DEFAULT '0', "finalPrice" numeric(12,2) NOT NULL DEFAULT '0', "isVerified" boolean NOT NULL DEFAULT false, "status" integer NOT NULL DEFAULT '0', "stock_quantity" integer NOT NULL DEFAULT '0', "sold_count" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_464f927ae360106b783ed0b4106" UNIQUE ("slug"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_718dfbc007ec098cfa28295ca7" ON "products"  ("deleted_at") `);
        await queryRunner.query(`CREATE TABLE "authors" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "name" character varying(255) NOT NULL, "describe" text, CONSTRAINT "PK_d2ed02fabd9b52847ccb85e6b88" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e49e956f80a76e51ee63665c16" ON "authors"  ("deleted_at") `);
        await queryRunner.query(`CREATE TABLE "product_categories" ("product_id" uuid NOT NULL, "category_id" uuid NOT NULL, CONSTRAINT "PK_54f2e1dbf14cfa770f59f0aac8f" PRIMARY KEY ("product_id", "category_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8748b4a0e8de6d266f2bbc877f" ON "product_categories"  ("product_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9148da8f26fc248e77a387e311" ON "product_categories"  ("category_id") `);
        await queryRunner.query(`CREATE TABLE "book_authors" ("product_id" uuid NOT NULL, "author_id" uuid NOT NULL, CONSTRAINT "PK_b41e11977b274607f2fab6cece4" PRIMARY KEY ("product_id", "author_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bbec3d74143236cb744f558a73" ON "book_authors"  ("product_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_6fb8ac32a0a0bbca076b2cf7c5" ON "book_authors"  ("author_id") `);
        await queryRunner.query(`ALTER TABLE "book_details" ADD CONSTRAINT "FK_33d67ea81e1ce8cac22dd5deec0" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_categories" ADD CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "product_categories" ADD CONSTRAINT "FK_9148da8f26fc248e77a387e3112" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "book_authors" ADD CONSTRAINT "FK_bbec3d74143236cb744f558a73a" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "book_authors" ADD CONSTRAINT "FK_6fb8ac32a0a0bbca076b2cf7c5a" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "book_authors" DROP CONSTRAINT "FK_6fb8ac32a0a0bbca076b2cf7c5a"`);
        await queryRunner.query(`ALTER TABLE "book_authors" DROP CONSTRAINT "FK_bbec3d74143236cb744f558a73a"`);
        await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_9148da8f26fc248e77a387e3112"`);
        await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6"`);
        await queryRunner.query(`ALTER TABLE "book_details" DROP CONSTRAINT "FK_33d67ea81e1ce8cac22dd5deec0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6fb8ac32a0a0bbca076b2cf7c5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bbec3d74143236cb744f558a73"`);
        await queryRunner.query(`DROP TABLE "book_authors"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9148da8f26fc248e77a387e311"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8748b4a0e8de6d266f2bbc877f"`);
        await queryRunner.query(`DROP TABLE "product_categories"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e49e956f80a76e51ee63665c16"`);
        await queryRunner.query(`DROP TABLE "authors"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_718dfbc007ec098cfa28295ca7"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_89c4679eb14987f71167cd9b27"`);
        await queryRunner.query(`DROP TABLE "book_details"`);
    }

}
