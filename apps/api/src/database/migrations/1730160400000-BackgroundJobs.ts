import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class BackgroundJobs1730160400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'background_jobs',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'job_type',
            type: 'enum',
            enum: ['render', 'upload', 'maintenance'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'idempotency_key',
            type: 'varchar',
            length: '128',
            isNullable: true,
            isUnique: true,
          },
          {
            name: 'video_project_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'payload_json',
            type: 'json',
          },
          {
            name: 'attempt_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'max_attempts',
            type: 'int',
            default: 3,
          },
          {
            name: 'locked_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'locked_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'lock_expires_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'next_retry_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'last_error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'result_json',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'background_jobs',
      new TableIndex({
        name: 'IDX_background_jobs_status_next_retry',
        columnNames: ['status', 'next_retry_at'],
      }),
    );

    await queryRunner.createIndex(
      'background_jobs',
      new TableIndex({
        name: 'IDX_background_jobs_project',
        columnNames: ['video_project_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('background_jobs', true);
  }
}
