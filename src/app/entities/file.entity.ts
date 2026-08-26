import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
export class FileUpload extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 100 })
  storedName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column()
  size: number;

  @Column({ type: 'varchar', length: 255 })
  storagePath: string;

  @ManyToOne(() => User, user => user.files, { nullable: false, onDelete: 'CASCADE' })
  uploadedBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
