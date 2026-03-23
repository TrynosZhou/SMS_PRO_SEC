import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateRecordBookTable1700400000000 implements MigrationInterface {
  private async foreignKeyExists(
    queryRunner: QueryRunner,
    columnName: string,
    referencedTableName: string
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_class ref ON ref.oid = c.confrelid
      WHERE rel.relname = 'record_books'
        AND ref.relname = $1
        AND c.contype = 'f'
        AND c.conkey @> ARRAY[
          (SELECT attnum
           FROM pg_attribute
           WHERE attrelid = rel.oid AND attname = $2)
        ]
      LIMIT 1;
      `,
      [referencedTableName, columnName]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'record_books',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'studentId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'teacherId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'classId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'term',
            type: 'varchar',
            length: '50',
            isNullable: false
          },
          {
            name: 'year',
            type: 'varchar',
            length: '10',
            isNullable: false
          },
          {
            name: 'test1',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true
          },
          {
            name: 'test1Topic',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'test2',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true
          },
          {
            name: 'test2Topic',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'test3',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true
          },
          {
            name: 'test3Topic',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'test4',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true
          },
          {
            name: 'test4Topic',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    );

    // Create unique index
    await queryRunner.createIndex(
      'record_books',
      new TableIndex({
        name: 'IDX_RECORD_BOOK_UNIQUE',
        columnNames: ['studentId', 'teacherId', 'classId', 'term', 'year'],
        isUnique: true
      })
    );

    // Create foreign keys
    const studentFkExists = await this.foreignKeyExists(queryRunner, 'studentId', 'students');
    if (!studentFkExists) {
      await queryRunner.createForeignKey(
        'record_books',
        new TableForeignKey({
          columnNames: ['studentId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'students',
          onDelete: 'CASCADE'
        })
      );
    }

    const teacherFkExists = await this.foreignKeyExists(queryRunner, 'teacherId', 'teachers');
    if (!teacherFkExists) {
      await queryRunner.createForeignKey(
        'record_books',
        new TableForeignKey({
          columnNames: ['teacherId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'teachers',
          onDelete: 'CASCADE'
        })
      );
    }

    const classFkExists = await this.foreignKeyExists(queryRunner, 'classId', 'classes');
    if (!classFkExists) {
      await queryRunner.createForeignKey(
        'record_books',
        new TableForeignKey({
          columnNames: ['classId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'classes',
          onDelete: 'CASCADE'
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('record_books');
  }
}

