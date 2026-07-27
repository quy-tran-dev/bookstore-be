import { MigrationInterface, QueryRunner } from "typeorm";

export class InitDatabase1785189838780 implements MigrationInterface {
    name = 'InitDatabase1785189838780'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_details" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "fullName" character varying(255) NOT NULL, "phone" character varying(20), "address" text, "avatarUrl" text, "user_id" uuid, CONSTRAINT "REL_ef1a1915f99bcf7a87049f7449" UNIQUE ("user_id"), CONSTRAINT "PK_fb08394d3f499b9e441cab9ca51" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9a66073cc1fc2f5f833a01f7f7" ON "user_details"  ("deleted_at") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "email" character varying(255) NOT NULL, "password" character varying(255), "role" character varying(50) NOT NULL DEFAULT 'CUSTOMER', "is_verified" boolean NOT NULL DEFAULT false, "verification_token" character varying, "verification_verified_at" TIMESTAMP WITH TIME ZONE, "reset_password_token" character varying, "reset_password_expires" TIMESTAMP WITH TIME ZONE, "hashed_refresh_token" character varying, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_073999dfec9d14522f0cf58cd6" ON "users"  ("deleted_at") `);
        await queryRunner.query(`CREATE TABLE "authenticators" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "credential_id" text NOT NULL, "credential_public_key" bytea NOT NULL, "counter" bigint NOT NULL DEFAULT '0', "device_type" character varying(32) NOT NULL, "backed_up" boolean NOT NULL DEFAULT false, "user_id" uuid NOT NULL, CONSTRAINT "PK_1f524613bc876f10f9ba8b0f394" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c9a317a71b3b99b6f7485e3603" ON "authenticators"  ("deleted_at") `);
        await queryRunner.query(`ALTER TABLE "user_details" ADD CONSTRAINT "FK_ef1a1915f99bcf7a87049f74494" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "authenticators" ADD CONSTRAINT "FK_79111b083a20c575bdd813f3b67" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "authenticators" DROP CONSTRAINT "FK_79111b083a20c575bdd813f3b67"`);
        await queryRunner.query(`ALTER TABLE "user_details" DROP CONSTRAINT "FK_ef1a1915f99bcf7a87049f74494"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c9a317a71b3b99b6f7485e3603"`);
        await queryRunner.query(`DROP TABLE "authenticators"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_073999dfec9d14522f0cf58cd6"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9a66073cc1fc2f5f833a01f7f7"`);
        await queryRunner.query(`DROP TABLE "user_details"`);
    }

}
