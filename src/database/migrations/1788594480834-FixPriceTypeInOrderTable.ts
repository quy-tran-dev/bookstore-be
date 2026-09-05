import { MigrationInterface, QueryRunner } from "typeorm";

export class FixPriceTypeInOrderTable1788594480834 implements MigrationInterface {
    name = 'FixPriceTypeInOrderTable1788594480834'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "unitPrice"`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "unitPrice" numeric NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "totalPrice"`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "totalPrice" numeric NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "totalAmount"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "totalAmount" numeric NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shippingFee"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "shippingFee" numeric NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "finalAmount"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "finalAmount" numeric NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "finalAmount"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "finalAmount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shippingFee"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "shippingFee" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "totalAmount"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "totalAmount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "totalPrice"`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "totalPrice" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "unitPrice"`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "unitPrice" integer NOT NULL`);
    }

}
