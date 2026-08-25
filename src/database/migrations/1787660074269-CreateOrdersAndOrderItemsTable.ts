import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrdersAndOrderItemsTable1787660074269 implements MigrationInterface {
    name = 'CreateOrdersAndOrderItemsTable1787660074269'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED', 'REFUNDED')`);
        await queryRunner.query(`CREATE TYPE "public"."orders_paymentmethod_enum" AS ENUM('COD', 'VNPAY', 'MOMO')`);
        await queryRunner.query(`CREATE TYPE "public"."orders_paymentstatus_enum" AS ENUM('UNPAID', 'PAID', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "code" character varying(50) NOT NULL, "customerName" character varying(255) NOT NULL, "customerPhone" character varying(20) NOT NULL, "shippingAddress" text NOT NULL, "note" text, "noteAdmin" text, "totalAmount" integer NOT NULL DEFAULT '0', "shippingFee" integer NOT NULL DEFAULT '0', "finalAmount" integer NOT NULL DEFAULT '0', "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING', "paymentMethod" "public"."orders_paymentmethod_enum" NOT NULL DEFAULT 'COD', "paymentStatus" "public"."orders_paymentstatus_enum" NOT NULL DEFAULT 'UNPAID', "user_id" uuid, CONSTRAINT "UQ_3e413c10c595c04c6c70e58a4dc" UNIQUE ("code"), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_09b0a39ef7c0b162f6a2f3c860" ON "orders"  ("deleted_at") `);
        await queryRunner.query(`CREATE TABLE "order_items" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "create_by" character varying, "update_by" character varying, "delete_by" character varying, "productName" character varying(255) NOT NULL, "quantity" integer NOT NULL, "unitPrice" integer NOT NULL, "totalPrice" integer NOT NULL, "order_id" uuid, "product_id" uuid, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bfd91f86461c497971a5d27bd2" ON "order_items"  ("deleted_at") `);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bfd91f86461c497971a5d27bd2"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09b0a39ef7c0b162f6a2f3c860"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TYPE "public"."orders_paymentstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."orders_paymentmethod_enum"`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    }

}
