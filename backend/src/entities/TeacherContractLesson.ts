import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

/**
 * Per teacher–class–subject: whether each scheduled session counts as one period or two (double period) for load and generation.
 */
@Entity('teacher_contract_lessons')
@Unique(['teacherId', 'classId', 'subjectId'])
@Index(['teacherId'])
@Index(['classId'])
export class TeacherContractLesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  teacherId: string;

  @Column({ type: 'uuid' })
  classId: string;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'boolean', default: false })
  isDoublePeriod: boolean;
}
