import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { AppDataSource } from '../config/database';
import { Class } from '../entities/Class';
import { Exam } from '../entities/Exam';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Teacher } from '../entities/Teacher';
import { Subject } from '../entities/Subject';
import { In } from 'typeorm';
import { isDemoUser } from '../utils/demoDataFilter';
import { Student } from '../entities/Student';
import { User } from '../entities/User';
import { StudentEnrollment } from '../entities/StudentEnrollment';
import { RecordBook } from '../entities/RecordBook';
import { TeacherClass } from '../entities/TeacherClass';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';
import { linkClassToTeachers } from '../utils/teacherClassLinker';
import { buildPaginationResponse, parsePaginationParams } from '../utils/pagination';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const classRepository = AppDataSource.getRepository(Class);
    
    if (isDemoUser(req)) {
      await ensureDemoDataAvailable();
    }

    // Try to load with relations, but handle errors gracefully
    let classes;
    try {
      classes = await classRepository.find({
        relations: ['students', 'students.user', 'teachers', 'subjects', 'classTeacher'],
      });
    } catch (relationError: any) {
      console.error('[getClasses] Error loading with relations:', relationError.message);
      console.error('[getClasses] Error code:', relationError.code);
      console.error('[getClasses] Error stack:', relationError.stack);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.message?.includes('column') ||
                          relationError.code === '42P01' || // PostgreSQL: relation does not exist
                          relationError.code === '42703';   // PostgreSQL: undefined column
      
      if (isTableError) {
        console.log('[getClasses] Table/relation error detected, trying fallback queries');
        // Fallback 1: load without teachers relation
        try {
          classes = await classRepository.find({
            relations: ['students', 'students.user', 'subjects']
          });
          // Initialize teachers array for all classes
          classes = classes.map((c: any) => ({
            ...c,
            teachers: c.teachers || []
          }));
          console.log('[getClasses] Successfully loaded classes without teachers relation');
        } catch (fallbackError1: any) {
          console.error('[getClasses] Fallback 1 failed:', fallbackError1.message);
          // Fallback 2: load without nested user relation
          try {
            classes = await classRepository.find({
              relations: ['students', 'subjects']
            });
            classes = classes.map((c: any) => ({
              ...c,
              teachers: c.teachers || [],
              students: (c.students || []).map((s: any) => ({
                ...s,
                user: s.user || null
              }))
            }));
            console.log('[getClasses] Successfully loaded classes without nested user relation');
          } catch (fallbackError2: any) {
            console.error('[getClasses] Fallback 2 failed:', fallbackError2.message);
            // Last resort: load without any relations
            try {
              classes = await classRepository.find();
              classes = classes.map((c: any) => ({
                ...c,
                teachers: [],
                students: [],
                subjects: []
              }));
              console.log('[getClasses] Successfully loaded classes without relations');
            } catch (finalError: any) {
              console.error('[getClasses] All fallbacks failed:', finalError.message);
              // Return empty array as last resort
              classes = [];
            }
          }
        }
      } else {
        // For other errors, try fallback before rethrowing
        console.log('[getClasses] Non-table error, trying fallback before rethrowing');
        try {
          classes = await classRepository.find({
            relations: ['subjects']
          });
          classes = classes.map((c: any) => ({
            ...c,
            teachers: [],
            students: []
          }));
          console.log('[getClasses] Fallback successful for non-table error');
        } catch (fallbackError: any) {
          console.error('[getClasses] Fallback failed, rethrowing original error');
          throw relationError;
        }
      }
    }
    
    // Removed demo filtering - demo users can now see all students in classes
    
    // Ensure classes is always an array
    if (!Array.isArray(classes)) {
      console.warn('[getClasses] Classes is not an array, initializing as empty array');
      classes = [];
    }
    
    // Ensure all classes have required arrays initialized
    classes = classes.map((c: any) => ({
      ...c,
      teachers: Array.isArray(c.teachers) ? c.teachers : [],
      students: Array.isArray(c.students) ? c.students : [],
      subjects: Array.isArray(c.subjects) ? c.subjects : [],
      classTeacher: c.classTeacher ?? null,
    }));
    
    const pagination = parsePaginationParams(req.query);
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let normalizedClasses = Array.isArray(classes) ? classes : [];

    if (searchQuery) {
      normalizedClasses = normalizedClasses.filter((classItem: any) => {
        const name = (classItem.name || '').toLowerCase();
        const form = (classItem.form || '').toLowerCase();
        const description = (classItem.description || '').toLowerCase();
        return name.includes(searchQuery) || form.includes(searchQuery) || description.includes(searchQuery);
      });
    }

    if (pagination.isPaginated) {
      const total = normalizedClasses.length;
      const paged = normalizedClasses.slice(pagination.skip, pagination.skip + pagination.limit);
      return res.json(buildPaginationResponse(paged, pagination.page, pagination.limit, total));
    }

    res.json(normalizedClasses);
  } catch (error: any) {
    console.error('[getClasses] Error:', error);
    console.error('[getClasses] Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const classRepository = AppDataSource.getRepository(Class);
    
    let classEntity;
    try {
      classEntity = await classRepository.findOne({
        where: { id },
        relations: ['students', 'teachers', 'subjects', 'classTeacher'],
      });
    } catch (relationError: any) {
      console.error('[getClassById] Error loading with relations:', relationError.message);
      console.error('[getClassById] Error code:', relationError.code);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.code === '42P01'; // PostgreSQL: relation does not exist
      
      if (isTableError) {
        console.log('[getClassById] Table/relation error detected, loading without teachers relation');
        // Fallback: load without teachers relation
        try {
          classEntity = await classRepository.findOne({
            where: { id },
            relations: ['students', 'subjects']
          });
          if (classEntity) {
            (classEntity as any).teachers = [];
          }
        } catch (fallbackError: any) {
          console.error('[getClassById] Error in fallback query:', fallbackError.message);
          // Last resort: load without any relations
          classEntity = await classRepository.findOne({
            where: { id }
          });
          if (classEntity) {
            (classEntity as any).teachers = [];
            (classEntity as any).students = [];
            (classEntity as any).subjects = [];
          }
        }
      } else {
        // For other errors, rethrow to be caught by outer catch
        throw relationError;
      }
    }

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classEntity);
  } catch (error: any) {
    console.error('[getClassById] Error:', error);
    console.error('[getClassById] Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
  try {
    const { name, form, description, teacherIds, subjectIds, classTeacherId } = req.body;
    const classRepository = AppDataSource.getRepository(Class);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Validate required fields
    if (!name || !form) {
      return res.status(400).json({ message: 'Name and form are required' });
    }

    // Check if name already exists (id is already unique as primary key)
    const existingClassByName = await classRepository.findOne({ where: { name } });
    if (existingClassByName) {
      return res.status(400).json({ 
        message: `A class with name "${name}" already exists. Please use a different name.` 
      });
    }

    const effectiveTeacherIds: string[] = Array.isArray(teacherIds) ? [...teacherIds] : [];
    if (classTeacherId && typeof classTeacherId === 'string' && !effectiveTeacherIds.includes(classTeacherId)) {
      effectiveTeacherIds.push(classTeacherId);
    }

    const classEntity = classRepository.create({
      name,
      form,
      description,
      classTeacherId: classTeacherId && typeof classTeacherId === 'string' ? classTeacherId : null,
    });

    if (classEntity.classTeacherId) {
      const ct = await teacherRepository.findOne({ where: { id: classEntity.classTeacherId } });
      if (!ct) {
        return res.status(400).json({ message: 'Invalid class teacher' });
      }
    }

    // Assign subjects if provided
    if (subjectIds && Array.isArray(subjectIds) && subjectIds.length > 0) {
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      classEntity.subjects = subjects;
    }

    // Assign teachers via ManyToMany
    if (effectiveTeacherIds.length > 0) {
      const teachers = await teacherRepository.find({ where: { id: In(effectiveTeacherIds) } });
      if (teachers.length !== effectiveTeacherIds.length) {
        return res.status(400).json({ message: 'One or more teacher IDs are invalid' });
      }
      classEntity.teachers = teachers;
    }

    // Save class
    await classRepository.save(classEntity);

    // Also link class to teachers using the junction table (in addition to ManyToMany)
    if (effectiveTeacherIds.length > 0) {
      try {
        await linkClassToTeachers(classEntity.id, effectiveTeacherIds);
        console.log('[createClass] Linked class to teachers via junction table');
      } catch (linkError: any) {
        console.error('[createClass] Error linking class to teachers via junction table:', linkError);
      }
    }

    // Load the class with relations
    const savedClass = await classRepository.findOne({
      where: { id: classEntity.id },
      relations: ['students', 'teachers', 'subjects', 'classTeacher'],
    });
    
    res.status(201).json({ message: 'Class created successfully', class: savedClass });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, form, description, isActive, teacherIds, subjectIds, classTeacherId } = req.body;
    const classRepository = AppDataSource.getRepository(Class);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const classTeacherInBody = Object.prototype.hasOwnProperty.call(req.body, 'classTeacherId');

    const classEntity = await classRepository.findOne({ 
      where: { id },
      relations: ['teachers', 'subjects'],
    });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Validate name uniqueness if being updated (id is already unique as primary key)
    if (name !== undefined && name !== classEntity.name) {
      const existingClassByName = await classRepository.findOne({ where: { name } });
      if (existingClassByName) {
        return res.status(400).json({ 
          message: `A class with name "${name}" already exists. Please use a different name.` 
        });
      }
      classEntity.name = name;
    }

    // Update fields
    if (form !== undefined) classEntity.form = form;
    if (description !== undefined) classEntity.description = description;
    if (isActive !== undefined) classEntity.isActive = isActive;

    // Update subjects if provided
    if (subjectIds !== undefined) {
      if (Array.isArray(subjectIds) && subjectIds.length > 0) {
        const subjectRepository = AppDataSource.getRepository(Subject);
        const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
        classEntity.subjects = subjects;
      } else {
        classEntity.subjects = [];
      }
    }

    let effectiveTeacherIds: string[];
    if (teacherIds !== undefined) {
      effectiveTeacherIds = Array.isArray(teacherIds) ? [...teacherIds] : [];
    } else {
      effectiveTeacherIds = (classEntity.teachers || []).map((t) => t.id);
    }

    if (classTeacherInBody && classTeacherId && typeof classTeacherId === 'string') {
      if (!effectiveTeacherIds.includes(classTeacherId)) {
        effectiveTeacherIds.push(classTeacherId);
      }
    }

    const shouldRefreshTeachers =
      teacherIds !== undefined ||
      (classTeacherInBody && !!classTeacherId && typeof classTeacherId === 'string');

    if (shouldRefreshTeachers) {
      if (effectiveTeacherIds.length > 0) {
        const teachers = await teacherRepository.find({ where: { id: In(effectiveTeacherIds) } });
        if (teachers.length !== effectiveTeacherIds.length) {
          return res.status(400).json({ message: 'One or more teacher IDs are invalid' });
        }
        classEntity.teachers = teachers;
      } else {
        classEntity.teachers = [];
      }
    }

    if (classTeacherInBody) {
      if (!classTeacherId) {
        classEntity.classTeacherId = null;
      } else if (typeof classTeacherId === 'string') {
        if (!effectiveTeacherIds.includes(classTeacherId)) {
          return res.status(400).json({
            message: 'Class teacher must be one of the teachers assigned to this class',
          });
        }
        const ct = await teacherRepository.findOne({ where: { id: classTeacherId } });
        if (!ct) {
          return res.status(400).json({ message: 'Invalid class teacher' });
        }
        classEntity.classTeacherId = classTeacherId;
      }
    } else if (
      classEntity.classTeacherId &&
      !effectiveTeacherIds.includes(classEntity.classTeacherId)
    ) {
      classEntity.classTeacherId = null;
    }

    // Save class
    await classRepository.save(classEntity);

    // Junction table: refresh when teacher list or class teacher changes
    const shouldRelinkJunction = teacherIds !== undefined || classTeacherInBody;
    if (shouldRelinkJunction) {
      try {
        await linkClassToTeachers(classEntity.id, effectiveTeacherIds);
        console.log('[updateClass] Linked class to teachers via junction table');
      } catch (linkError: any) {
        console.error('[updateClass] Error linking class to teachers via junction table:', linkError);
      }
    }

    // Load the updated class with all relations
    const updatedClass = await classRepository.findOne({
      where: { id },
      relations: ['students', 'teachers', 'subjects', 'classTeacher'],
    });
    
    res.json({ message: 'Class updated successfully', class: updatedClass });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete class with ID:', id);
    
    const classRepository = AppDataSource.getRepository(Class);
    const examRepository = AppDataSource.getRepository(Exam);
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const studentRepository = AppDataSource.getRepository(Student);

    // Find the class with relations needed for cleanup (subjects, teachers for M2M)
    const classEntity = await classRepository.findOne({
      where: { id },
      relations: ['teachers', 'subjects']
    });

    if (!classEntity) {
      console.log('Class not found with ID:', id);
      return res.status(404).json({ message: 'Class not found' });
    }

    // Accurate DB counts (relation arrays can be incomplete; demo vs non-demo must use same rules)
    const studentCount = await studentRepository.count({ where: { classId: id } });
    const m2mTeacherCount = classEntity.teachers?.length ?? 0;
    let junctionTeacherCount = 0;
    try {
      const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
      junctionTeacherCount = await teacherClassRepository.count({ where: { classId: id } });
    } catch {
      junctionTeacherCount = 0;
    }
    const teacherCount = Math.max(m2mTeacherCount, junctionTeacherCount);

    const examCount = await examRepository.count({ where: { classId: id } });

    let enrollmentCount = 0;
    try {
      const enrollmentRepository = AppDataSource.getRepository(StudentEnrollment);
      enrollmentCount = await enrollmentRepository.count({ where: { classId: id } });
    } catch {
      enrollmentCount = 0;
    }

    let recordBookCount = 0;
    try {
      const recordBookRepository = AppDataSource.getRepository(RecordBook);
      recordBookCount = await recordBookRepository.count({ where: { classId: id } });
    } catch {
      recordBookCount = 0;
    }

    const blockingReasons: string[] = [];
    if (studentCount > 0) blockingReasons.push(`${studentCount} student(s) still assigned to this class`);
    if (teacherCount > 0) blockingReasons.push(`${teacherCount} teacher link(s) (assignments)`);
    if (examCount > 0) blockingReasons.push(`${examCount} exam(s) for this class`);
    if (enrollmentCount > 0) blockingReasons.push(`${enrollmentCount} enrollment record(s)`);
    if (recordBookCount > 0) blockingReasons.push(`${recordBookCount} record book row(s)`);

    if (blockingReasons.length > 0) {
      return res.status(400).json({
        message: `Cannot delete "${classEntity.name}": ${blockingReasons.join('; ')}. Remove or reassign these first, then try again.`,
        details: {
          students: studentCount,
          teachers: teacherCount,
          exams: examCount,
          enrollments: enrollmentCount,
          recordBooks: recordBookCount
        }
      });
    }

    // Delete all report card remarks associated with this class
    const remarks = await remarksRepository.find({
      where: { classId: id }
    });
    
    if (remarks.length > 0) {
      console.log(`Deleting ${remarks.length} report card remarks associated with class`);
      await remarksRepository.remove(remarks);
    }

    // Remove associations with subjects (ManyToMany)
    if (classEntity.subjects && classEntity.subjects.length > 0) {
      console.log('Removing subject associations');
      classEntity.subjects = [];
      await classRepository.save(classEntity);
    }

    // Delete the class
    console.log('Deleting class:', classEntity.name);
    await classRepository.remove(classEntity);
    console.log('Class deleted successfully');
    res.json({ message: 'Class deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting class:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;

