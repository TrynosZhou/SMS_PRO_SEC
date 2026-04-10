import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Department } from '../entities/Department';
import { AuthRequest } from '../middleware/auth';

function normalizeDepartmentName(input: unknown): string {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export const listDepartments = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const rows = await AppDataSource.getRepository(Department).find({
      order: { name: 'ASC' },
    });
    return res.json(rows);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const name = normalizeDepartmentName(req.body?.name);
    if (!name) return res.status(400).json({ message: 'Department name is required' });

    const repo = AppDataSource.getRepository(Department);
    const exists = await repo.findOne({ where: { name } as any });
    if (exists) return res.status(409).json({ message: 'Department already exists' });

    const row = repo.create({ name, isActive: true });
    await repo.save(row);
    return res.status(201).json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

export const updateDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ message: 'Department id is required' });

    const repo = AppDataSource.getRepository(Department);
    const row = await repo.findOne({ where: { id } as any });
    if (!row) return res.status(404).json({ message: 'Department not found' });

    const name = req.body?.name !== undefined ? normalizeDepartmentName(req.body?.name) : undefined;
    const isActive = req.body?.isActive;

    if (name !== undefined) {
      if (!name) return res.status(400).json({ message: 'Department name cannot be empty' });
      const other = await repo
        .createQueryBuilder('d')
        .where('d.name = :name AND d.id <> :id', { name, id })
        .getOne();
      if (other) return res.status(409).json({ message: 'Another department with this name already exists' });
      row.name = name;
    }
    if (isActive !== undefined) {
      row.isActive = Boolean(isActive);
    }

    await repo.save(row);
    return res.json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ message: 'Department id is required' });

    const repo = AppDataSource.getRepository(Department);
    const row = await repo.findOne({ where: { id } as any });
    if (!row) return res.status(404).json({ message: 'Department not found' });

    await repo.remove(row);
    return res.json({ message: 'Deleted' });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

