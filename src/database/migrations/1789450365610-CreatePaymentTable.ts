import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePaymentTable1789450365610 implements MigrationInterface {
    name = 'CreatePaymentTable1789450365610'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('COD', 'VNPAY', 'MOMO')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('UNPAID', 'PAID', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "amount" numeric(12,2) NOT NULL DEFAULT '0', "method" "public"."payments_method_enum" NOT NULL DEFAULT 'VNPAY', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'UNPAID', "transaction_no" character varying(255), "bank_code" character varying(50), "bank_tran_no" character varying(255), "card_type" character varying(50), "order_info" character varying(255), "paid_at" TIMESTAMP WITH TIME ZONE, "response_code" character varying(50), "raw_response" jsonb, "order_id" uuid, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_68a0141dae3b66e4c9b102ce3e" ON "payments"  ("deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_b2f7b823a21562eeca20e72b00" ON "payments"  ("order_id") `);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_b2f7b823a21562eeca20e72b006" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_b2f7b823a21562eeca20e72b006"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b2f7b823a21562eeca20e72b00"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_68a0141dae3b66e4c9b102ce3e"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
    }

}
