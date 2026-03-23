import { AppDataSource } from '../config/database';

async function tableExists(tableName: string): Promise<boolean> {
  const res = await AppDataSource.query(`SELECT to_regclass('public.${tableName}') AS table_exists`);
  return Boolean(res?.[0]?.table_exists);
}

export async function ensurePayrollTables(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  await AppDataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

  // Enums
  await AppDataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_employmentstatus_enum') THEN
        CREATE TYPE payroll_employmentstatus_enum AS ENUM('active','inactive','terminated');
      END IF;
    END $$;
  `);

  await AppDataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_salarycomponenttype_enum') THEN
        CREATE TYPE payroll_salarycomponenttype_enum AS ENUM('allowance','deduction');
      END IF;
    END $$;
  `);

  await AppDataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_runstatus_enum') THEN
        CREATE TYPE payroll_runstatus_enum AS ENUM('draft','pending_approval','approved','paid','cancelled');
      END IF;
    END $$;
  `);

  if (!(await tableExists('payroll_employees'))) {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS payroll_employees (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeNumber" varchar NOT NULL,
        "fullName" varchar NOT NULL,
        "designation" varchar,
        "department" varchar,
        "salaryType" varchar,
        "bankName" varchar,
        "bankAccountNumber" varchar,
        "employmentStatus" payroll_employmentstatus_enum NOT NULL DEFAULT 'active',
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_payroll_employees_id" PRIMARY KEY (id),
        CONSTRAINT "UQ_payroll_employees_employeeNumber" UNIQUE ("employeeNumber")
      );
      CREATE INDEX IF NOT EXISTS "IDX_payroll_employees_department" ON payroll_employees ("department");
      CREATE INDEX IF NOT EXISTS "IDX_payroll_employees_salaryType" ON payroll_employees ("salaryType");
      CREATE INDEX IF NOT EXISTS "IDX_payroll_employees_employmentStatus" ON payroll_employees ("employmentStatus");
    `);
  }

  if (!(await tableExists('payroll_salary_structures'))) {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS payroll_salary_structures (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "salaryType" varchar NOT NULL,
        "basicSalary" decimal(10,2) NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "effectiveFrom" date,
        "description" text,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_payroll_salary_structures_id" PRIMARY KEY (id)
      );
      CREATE INDEX IF NOT EXISTS "IDX_payroll_salary_structures_salaryType" ON payroll_salary_structures ("salaryType");
      CREATE INDEX IF NOT EXISTS "IDX_payroll_salary_structures_isActive" ON payroll_salary_structures ("isActive");
    `);
  }

  if (!(await tableExists('payroll_salary_components'))) {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS payroll_salary_components (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        "structureId" uuid NOT NULL,
        "componentType" payroll_salarycomponenttype_enum NOT NULL DEFAULT 'allowance',
        "name" varchar NOT NULL,
        "amount" decimal(10,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_payroll_salary_components_id" PRIMARY KEY (id)
      );
      CREATE INDEX IF NOT EXISTS "IDX_payroll_salary_components_structureId" ON payroll_salary_components ("structureId");
      CREATE INDEX IF NOT EXISTS "IDX_payroll_salary_components_componentType" ON payroll_salary_components ("componentType");
    `);
  }

  if (!(await tableExists('payroll_runs'))) {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runMonth" int NOT NULL,
        "runYear" int NOT NULL,
        "periodLabel" varchar NOT NULL,
        "status" payroll_runstatus_enum NOT NULL DEFAULT 'draft',
        "createdBy" uuid,
        "approvedBy" uuid,
        "approvedAt" timestamp,
        "paidAt" timestamp,
        "notes" text,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_payroll_runs_id" PRIMARY KEY (id)
      );
      CREATE INDEX IF NOT EXISTS "IDX_payroll_runs_runYear" ON payroll_runs ("runYear");
      CREATE INDEX IF NOT EXISTS "IDX_payroll_runs_runMonth" ON payroll_runs ("runMonth");
    `);
  }

  if (!(await tableExists('payroll_run_lines'))) {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS payroll_run_lines (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payrollRunId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "employeeNumber" varchar NOT NULL,
        "employeeName" varchar NOT NULL,
        "department" varchar,
        "salaryType" varchar,
        "salaryStructureId" uuid,
        "basicSalary" decimal(10,2) NOT NULL DEFAULT 0,
        "totalAllowances" decimal(10,2) NOT NULL DEFAULT 0,
        "totalDeductions" decimal(10,2) NOT NULL DEFAULT 0,
        "extraAllowances" decimal(10,2) NOT NULL DEFAULT 0,
        "extraDeductions" decimal(10,2) NOT NULL DEFAULT 0,
        "adjustmentNotes" text,
        "netSalary" decimal(12,2) NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_payroll_run_lines_id" PRIMARY KEY (id)
      );
      CREATE INDEX IF NOT EXISTS "IDX_payroll_run_lines_payrollRunId" ON payroll_run_lines ("payrollRunId");
      CREATE INDEX IF NOT EXISTS "IDX_payroll_run_lines_employeeId" ON payroll_run_lines ("employeeId");
    `);
  }

  // Optional columns on payroll_employees (idempotent)
  if (await tableExists('payroll_employees')) {
    await AppDataSource.query(`
      ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS "salaryEffectiveFrom" date;
    `);
    await AppDataSource.query(`
      ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS "loanBalance" decimal(12,2) NOT NULL DEFAULT 0;
    `);
  }

  if (!(await tableExists('payroll_payslips'))) {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS payroll_payslips (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payrollRunLineId" uuid NOT NULL,
        "employeeId" uuid,
        "periodLabel" varchar NOT NULL,
        "pdfPath" text,
        "generatedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_payroll_payslips_id" PRIMARY KEY (id),
        CONSTRAINT "UQ_payroll_payslips_payrollRunLineId" UNIQUE ("payrollRunLineId")
      );
      CREATE INDEX IF NOT EXISTS "IDX_payroll_payslips_payrollRunLineId" ON payroll_payslips ("payrollRunLineId");
    `);
  }
}

