import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVerificationToken1770907747241 implements MigrationInterface {
    name = 'AddVerificationToken1770907747241'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS "verificationToken" character varying(255) NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS "verificationTokenExpiresAt" TIMESTAMP NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN IF EXISTS "verificationTokenExpiresAt"
        `);
        await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN IF EXISTS "verificationToken"
        `);
    }
}
