TO:DO
New FileUpload TypeORM entity storing originalName, storedName, mimeType, size, storagePath, uploadedBy (FK to User), and createdAt

import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';


@Entity()
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 100 })
  storedName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

@Column()
size: int;

@Column({ type: 'varchar', length: 255 })
storagePath: string;

@Column()
uploadedBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

 

  }
}

