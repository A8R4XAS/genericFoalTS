import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1787575048166 implements MigrationInterface {
    name = 'Migration1787575048166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "file_upload" (
                "id" SERIAL NOT NULL,
                "originalName" character varying(255) NOT NULL,
                "storedName" character varying(100) NOT NULL,
                "mimeType" character varying(100) NOT NULL,
                "size" integer NOT NULL,
                "storagePath" character varying(255) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "uploadedById" integer NOT NULL,
                CONSTRAINT "PK_bb8460e39fcad3aaa44d1d7e5d3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "user" (
                "id" SERIAL NOT NULL,
                "email" character varying(255) NOT NULL,
                "password" character varying(255) NOT NULL,
                "firstName" character varying(100) NOT NULL,
                "lastName" character varying(100) NOT NULL,
                "role" character varying(50) NOT NULL DEFAULT 'user',
                "isVerified" boolean NOT NULL DEFAULT false,
                "verificationToken" character varying(255),
                "verificationTokenExpiresAt" TIMESTAMP,
                "resetPasswordToken" character varying(255),
                "resetPasswordTokenExpiresAt" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"),
                CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user" ("email")
        `);
        await queryRunner.query(`
            ALTER TABLE "file_upload"
            ADD CONSTRAINT "FK_fda5db6cf0d52a6288564a44ce6" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "file_upload" DROP CONSTRAINT "FK_fda5db6cf0d52a6288564a44ce6"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_e12875dfb3b1d92d7d7c5377e2"
        `);
        await queryRunner.query(`
            DROP TABLE "user"
        `);
        await queryRunner.query(`
            DROP TABLE "file_upload"
        `);
    }

}
