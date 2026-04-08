import { MigrationInterface, QueryRunner } from "typeorm";

export class AddResetPasswordToken1770907747242 implements MigrationInterface {
    name = 'AddResetPasswordToken1770907747242'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS "resetPasswordToken" character varying(255) NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS "resetPasswordTokenExpiresAt" TIMESTAMP NULL
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_user_resetPasswordToken"
            ON "user" ("resetPasswordToken")
            WHERE "resetPasswordToken" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_user_resetPasswordToken"
        `);
        await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN IF EXISTS "resetPasswordTokenExpiresAt"
        `);
        await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN IF EXISTS "resetPasswordToken"
        `);
    }
}
