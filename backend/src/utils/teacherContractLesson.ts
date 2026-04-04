import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { TeacherContractLesson } from '../entities/TeacherContractLesson';

/** Normalize IDs so map keys match even if casing differs between relations and DB. */
export function contractClassSubjectKey(classId: string, subjectId: string): string {
  return `${String(classId).toLowerCase().trim()}:${String(subjectId).toLowerCase().trim()}`;
}

export function contractGenerationKey(teacherId: string, classId: string, subjectId: string): string {
  return `${String(teacherId).toLowerCase().trim()}:${String(classId).toLowerCase().trim()}:${String(subjectId)
    .toLowerCase()
    .trim()}`;
}

/** Request body helper — tolerate string/boolean from JSON proxies or older clients. */
export function parseRequestDoublePeriod(body: any): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const v = body.isDoublePeriod;
  if (v === true || v === 1) {
    return true;
  }
  const s = String(v ?? '').toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') {
    return true;
  }
  const len = String(body.lessonLength ?? '').toLowerCase();
  return len === 'double';
}

let contractTableEnsured = false;

/**
 * Creates `teacher_contract_lessons` when migrations were not run (upsert was failing silently before).
 */
async function ensureTeacherContractLessonsTable(): Promise<void> {
  if (contractTableEnsured) {
    return;
  }
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  try {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "teacher_contract_lessons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "teacherId" uuid NOT NULL,
        "classId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "isDoublePeriod" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_teacher_contract_lessons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_teacher_contract_lessons_triple" UNIQUE ("teacherId", "classId", "subjectId"),
        CONSTRAINT "FK_teacher_contract_lessons_teacher" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_contract_lessons_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_contract_lessons_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE
      )
    `);
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_teacher_contract_lessons_teacherId" ON "teacher_contract_lessons" ("teacherId")`
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_teacher_contract_lessons_classId" ON "teacher_contract_lessons" ("classId")`
    );
    contractTableEnsured = true;
  } catch (e: any) {
    console.error('[TeacherContractLesson] ensureTeacherContractLessonsTable:', e?.message || e);
    throw e;
  } finally {
    await qr.release();
  }
}

export async function upsertTeacherContractLesson(
  teacherId: string,
  classId: string,
  subjectId: string,
  isDoublePeriod: boolean
): Promise<void> {
  await ensureTeacherContractLessonsTable();
  const repo = AppDataSource.getRepository(TeacherContractLesson);
  let row = await repo.findOne({ where: { teacherId, classId, subjectId } });
  if (!row) {
    row = repo.create({ teacherId, classId, subjectId, isDoublePeriod });
  } else {
    row.isDoublePeriod = isDoublePeriod;
  }
  await repo.save(row);
}

export async function deleteTeacherContractLesson(
  teacherId: string,
  classId: string,
  subjectId: string
): Promise<void> {
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    await repo.delete({ teacherId, classId, subjectId });
  } catch (e: any) {
    console.warn('[TeacherContractLesson] delete:', e?.message || e);
  }
}

function rowIsDouble(r: TeacherContractLesson): boolean {
  const v = r.isDoublePeriod as boolean | null | undefined;
  return v === true;
}

/** Map key classId:subjectId → double flag (for one teacher). */
export async function loadDoubleMapForTeacherClassesSubjects(
  teacherId: string
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    const rows = await repo.find({ where: { teacherId } });
    for (const r of rows) {
      map.set(contractClassSubjectKey(r.classId, r.subjectId), rowIsDouble(r));
    }
  } catch (e: any) {
    console.warn('[TeacherContractLesson] loadDoubleMapForTeacherClassesSubjects:', e?.message || e);
  }
  return map;
}

/** Map key teacherId:classId:subjectId → isDouble (timetable generation). */
export async function loadDoubleMapForGeneration(teacherIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (!teacherIds.length) {
    return map;
  }
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    const rows = await repo.find({ where: { teacherId: In(teacherIds) } });
    for (const r of rows) {
      map.set(contractGenerationKey(r.teacherId, r.classId, r.subjectId), rowIsDouble(r));
    }
  } catch (e: any) {
    console.warn('[TeacherContractLesson] loadDoubleMapForGeneration:', e?.message || e);
  }
  return map;
}
