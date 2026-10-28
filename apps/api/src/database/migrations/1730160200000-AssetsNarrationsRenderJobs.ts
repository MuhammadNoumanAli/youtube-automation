import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AssetsNarrationsRenderJobs1730160200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. assets
    await queryRunner.createTable(
      new Table({
        name: 'assets',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'video_project_id',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'asset_type',
            type: 'enum',
            enum: ['screen_recording', 'image', 'video', 'audio', 'music', 'graphic', 'other'],
            default: "'image'",
          },
          {
            name: 'storage_path',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'original_filename',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'mime_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'checksum_sha256',
            type: 'char',
            length: '64',
          },
          {
            name: 'source_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'creator',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'license_type',
            type: 'enum',
            enum: ['user_created', 'public_domain', 'creative_commons', 'purchased_license', 'fair_use_quoted'],
            default: "'user_created'",
          },
          {
            name: 'license_notes',
            type: 'text',
          },
          {
            name: 'attribution_text',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'commercial_use_allowed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'proof_of_permission_path',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'assets',
      new TableForeignKey({
        columnNames: ['video_project_id'],
        referencedTableName: 'video_projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'assets',
      new TableIndex({
        name: 'IDX_assets_project',
        columnNames: ['video_project_id'],
      }),
    );

    // 2. narrations
    await queryRunner.createTable(
      new Table({
        name: 'narrations',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'video_project_id',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'script_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            default: "'mock'",
          },
          {
            name: 'voice_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'storage_path',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'duration_seconds',
            type: 'decimal',
            precision: 8,
            scale: 2,
            default: 0,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'ready', 'failed'],
            default: "'ready'",
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'narrations',
      new TableForeignKey({
        columnNames: ['video_project_id'],
        referencedTableName: 'video_projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'narrations',
      new TableIndex({
        name: 'IDX_narrations_project',
        columnNames: ['video_project_id'],
      }),
    );

    // 3. render_jobs
    await queryRunner.createTable(
      new Table({
        name: 'render_jobs',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'video_project_id',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['queued', 'rendering', 'completed', 'failed', 'cancelled'],
            default: "'queued'",
          },
          {
            name: 'output_path',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'thumbnail_path',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'ffmpeg_command_summary',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'validation_json',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'finished_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'error_code',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'render_jobs',
      new TableForeignKey({
        columnNames: ['video_project_id'],
        referencedTableName: 'video_projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'render_jobs',
      new TableIndex({
        name: 'IDX_render_jobs_project',
        columnNames: ['video_project_id'],
      }),
    );

    // 4. approval_records
    await queryRunner.createTable(
      new Table({
        name: 'approval_records',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'video_project_id',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'approval_type',
            type: 'enum',
            enum: ['script', 'assets', 'render', 'upload', 'public_release'],
          },
          {
            name: 'decision',
            type: 'enum',
            enum: ['approved', 'rejected'],
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'approved_by',
            type: 'varchar',
            length: '100',
            default: "'local_creator'",
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'approval_records',
      new TableForeignKey({
        columnNames: ['video_project_id'],
        referencedTableName: 'video_projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'approval_records',
      new TableIndex({
        name: 'IDX_approval_records_project',
        columnNames: ['video_project_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('approval_records');
    await queryRunner.dropTable('render_jobs');
    await queryRunner.dropTable('narrations');
    await queryRunner.dropTable('assets');
  }
}
