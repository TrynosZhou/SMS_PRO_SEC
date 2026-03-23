import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { AuthRequest } from '../middleware/auth';

// Update user account (username and password) - works for teachers, parents, and students
export const updateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { newUsername, newEmail, currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Prevent demo users from changing their password
    if (req.user?.isDemo) {
      return res.status(403).json({ message: 'Demo accounts cannot change password. This is a demo environment.' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Allow updating password only, or username/email with password
    // If neither username nor email is provided, that's okay - user just wants to change password

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // For teachers, username (TeacherID) cannot be changed, especially on first login
    if (user.role === UserRole.TEACHER) {
      if (newUsername && newUsername !== user.username) {
        return res.status(400).json({ message: 'Username (TeacherID) cannot be changed for teacher accounts' });
      }
      // Also check if teacher is on first login (mustChangePassword is true)
      if (user.mustChangePassword && newUsername) {
        return res.status(400).json({ message: 'Username (TeacherID) cannot be changed. Only password can be changed on first login.' });
      }
    } else {
      // For other roles, check if new username already exists (if different from current)
      if (newUsername && newUsername !== user.username) {
        const existingUser = await userRepository.findOne({ where: { username: newUsername } });
        if (existingUser) {
          return res.status(400).json({ message: 'Username already exists' });
        }
      }
    }

    // Check if new email already exists (if provided and different from current)
    if (newEmail && newEmail !== user.email) {
      const existingUser = await userRepository.findOne({ where: { email: newEmail } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Update username if provided (but not for teachers)
    if (newUsername && user.role !== UserRole.TEACHER) {
      user.username = newUsername;
    }

    // Update email if provided
    if (newEmail) {
      user.email = newEmail;
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.isTemporaryAccount = false;

    await userRepository.save(user);

    res.json({ 
      message: 'Account updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Error updating teacher account:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Get current user account info
export const getAccountInfo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ 
      where: { id: userId },
      relations: ['teacher', 'parent', 'student']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      isTemporaryAccount: user.isTemporaryAccount,
      isDemo: user.isDemo,
      teacher: user.teacher,
      parent: user.parent,
      student: user.student
    });
  } catch (error: any) {
    console.error('Error getting account info:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

const generateTemporaryPassword = () => {
  return `Temp-${randomBytes(4).toString('hex')}-${Date.now().toString().slice(-4)}`;
};

// Admin/SuperAdmin: Create user accounts manually
export const createUserAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const actingRole = req.user.role;
    if (actingRole !== UserRole.ADMIN && actingRole !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Administrators can create user accounts' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      email,
      username,
      role,
      password,
      generatePassword = true,
      isDemo = false
    } = req.body || {};

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const requestedRole = String(role).toLowerCase() as UserRole;
    
    // For teachers: username is mandatory, email is not required
    if (requestedRole === UserRole.TEACHER) {
      if (!username || !username.trim()) {
        return res.status(400).json({ message: 'Username is mandatory for teacher accounts' });
      }
    } else {
      // For other roles: email is required
      if (!email) {
        return res.status(400).json({ message: 'Email is required for this role' });
      }
    }
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    if (actingRole !== UserRole.SUPERADMIN && requestedRole === UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Super Admins can create Super Admin accounts' });
    }

    const userRepository = AppDataSource.getRepository(User);
    
    // Only check email if provided (not required for teachers)
    if (email) {
      const trimmedEmail = String(email).trim().toLowerCase();
      const existingByEmail = await userRepository.findOne({ where: { email: trimmedEmail } });
      if (existingByEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Generate username from provided username or email (if available)
    // For teachers, username is mandatory and provided
    let finalUsername: string;
    if (requestedRole === UserRole.TEACHER) {
      // For teachers, use the provided username (already validated as mandatory)
      finalUsername = String(username).replace(/\s+/g, '').toLowerCase();
    } else {
      // For other roles, generate from username or email
      finalUsername = username 
        ? String(username).replace(/\s+/g, '').toLowerCase()
        : (email ? String(email).split('@')[0].replace(/\s+/g, '').toLowerCase() : `user_${Date.now()}`);
      if (!finalUsername) {
        finalUsername = `user_${Date.now()}`;
      }
    }
    
    // Ensure username is unique
    const baseUsername = finalUsername;
    let suffix = 1;
    let usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    while (usernameExists) {
      finalUsername = `${baseUsername}${suffix++}`;
      usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    }

    let plainPassword = (password ? String(password).trim() : '');
    let autoGenerated = false;
    if (!plainPassword) {
      plainPassword = generateTemporaryPassword();
      autoGenerated = true;
    }

    if (plainPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // If the role is DEMO_USER, automatically set isDemo to true
    const isDemoUser = requestedRole === UserRole.DEMO_USER;
    
    const user = userRepository.create({
      email: requestedRole === UserRole.TEACHER ? null : (email ? String(email).trim().toLowerCase() : null), // Email is not used for teachers
      username: finalUsername,
      password: hashedPassword,
      role: requestedRole,
      isDemo: isDemoUser || (actingRole === UserRole.SUPERADMIN && isDemo === true),
      mustChangePassword: !isDemoUser, // Demo users don't need to change password, others must change temporary password
      isTemporaryAccount: (requestedRole === UserRole.TEACHER || (autoGenerated && !isDemoUser)), // All teacher passwords are temporary, or auto-generated passwords for other roles
      isActive: true
    });

    await userRepository.save(user);

    // If role is TEACHER, create or link teacher profile
    if (requestedRole === UserRole.TEACHER) {
      const { Teacher } = await import('../entities/Teacher');
      const teacherRepository = AppDataSource.getRepository(Teacher);
      
      // Check if teacher profile already exists for this user
      let existingTeacher = await teacherRepository.findOne({ where: { userId: user.id } });
      
      // Also check if a teacher with the provided username (as teacherId) already exists
      let teacher = await teacherRepository.findOne({ where: { teacherId: finalUsername } });
      
      if (teacher && !teacher.userId) {
        // Teacher profile exists but not linked - link it to this user
        teacher.userId = user.id;
        await teacherRepository.save(teacher);
        // Ensure username matches teacherId
        if (user.username !== teacher.teacherId) {
          user.username = teacher.teacherId;
          await userRepository.save(user);
        }
        console.log(`[CreateUserAccount] Linked existing teacher profile (teacherId: ${teacher.teacherId}) to user ${user.id}`);
      } else if (!existingTeacher && !teacher) {
        // No teacher profile exists - create one with username as teacherId
        // The username provided is the TeacherID
        const teacherId = finalUsername;
        
        // Ensure teacherId is unique by checking if it exists
        let uniqueTeacherId = teacherId;
        let counter = 1;
        while (await teacherRepository.findOne({ where: { teacherId: uniqueTeacherId } })) {
          uniqueTeacherId = `${teacherId}_${counter}`;
          counter++;
        }
        
        // Create a basic teacher profile
        teacher = teacherRepository.create({
          teacherId: uniqueTeacherId,
          firstName: 'Teacher', // Default, can be updated later
          lastName: 'Account',
          userId: user.id,
          phoneNumber: null,
          address: null,
          dateOfBirth: null,
          isActive: true
        });
        
        await teacherRepository.save(teacher);
        
        // Update username to match teacherId (in case it was made unique)
        if (user.username !== uniqueTeacherId) {
          user.username = uniqueTeacherId;
          await userRepository.save(user);
        }
        
        console.log(`[CreateUserAccount] Created teacher profile for user ${user.id} with teacherId: ${uniqueTeacherId}`);
      } else if (existingTeacher) {
        // Teacher profile already linked - ensure username matches teacherId
        if (user.username !== existingTeacher.teacherId) {
          user.username = existingTeacher.teacherId;
          await userRepository.save(user);
        }
      }
    }

    res.status(201).json({
      message: 'User account created successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        isDemo: user.isDemo
      },
      temporaryCredentials: autoGenerated ? { password: plainPassword } : undefined
    });
  } catch (error: any) {
    console.error('Error creating user account:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Admin/SuperAdmin: reset a teacher user's password to a new temporary password.
 * Returns the plain temporary password once (display to admin only).
 */
export const adminResetTeacherPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.SUPERADMIN &&
      req.user.role !== UserRole.DEMO_USER
    ) {
      return res.status(403).json({ message: 'Only Administrators can reset passwords' });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);
    const targetUser = await userRepository.findOne({ where: { id: userId } });

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (targetUser.role !== UserRole.TEACHER) {
      return res.status(400).json({
        message: 'This action only applies to teacher accounts. Use other tools for other roles.'
      });
    }

    const plainPassword = generateTemporaryPassword();
    targetUser.password = await bcrypt.hash(plainPassword, 10);
    targetUser.mustChangePassword = true;
    targetUser.isTemporaryAccount = true;

    await userRepository.save(targetUser);

    res.json({
      message: 'Password reset successfully',
      temporaryPassword: plainPassword,
      username: targetUser.username
    });
  } catch (error: any) {
    console.error('Error in adminResetTeacherPassword:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

