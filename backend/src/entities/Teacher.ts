import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToMany, ManyToOne, JoinTable, Index } from 'typeorm';
import { User } from './User';
import { Subject } from './Subject';
import { Class } from './Class';

@Entity('teachers')
@Index(['teacherId'], { unique: true })
export class Teacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  teacherId: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  qualification: string;

  /** e.g. Male / Female — used for formal title on dashboards (Mr / Mrs) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'uuid', nullable: true })
  teachingSubjectId: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @OneToOne(() => User, user => user.teacher)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Subject, { nullable: true })
  @JoinColumn({ name: 'teachingSubjectId' })
  teachingSubject: Subject;

  @ManyToMany(() => Subject, subject => subject.teachers)
  @JoinTable()
  subjects: Subject[];

  @ManyToMany(() => Class, classEntity => classEntity.teachers)
  @JoinTable()
  classes: Class[];
}

