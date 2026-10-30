import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class UploadRecords1730160300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'upload_records',
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
            name: 'channel_profile_id',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'youtube_video_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'privacy_status',
            type: 'enum',
            enum: ['private'],
            default: "'private'",
          },
          {
            name: 'upload_status',
            type: 'enum',
            enum: ['pending_approval', 'approved', 'uploading', 'uploaded_private', 'failed'],
            default: "'pending_approval'",
          },
          {
            name: 'youtube_title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'youtube_description',
            type: 'text',
          },
          {
            name: 'youtube_tags',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'video_file_path',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'video_file_size',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'error_code',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'upload_attempts',
            type: 'int',
            default: 0,
          },
          {
            name: 'last_attempt_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'uploaded_at',
            type: 'datetime',
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

    // Foreign Keys
    await queryRunner.createForeignKey(
      'upload_records',
      new TableForeignKey({
        columnNames: ['video_project_id'],
        referencedTableName: 'video_projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'upload_records',
      new TableForeignKey({
        columnNames: ['channel_profile_id'],
        referencedTableName: 'channel_profiles',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Indexes
    await queryRunner.createIndex(
      'upload_records',
      new TableIndex({
        name: 'IDX_UPLOAD_RECORDS_PROJECT',
        columnNames: ['video_project_id'],
      }),
    );

    await queryRunner.createIndex(
      'upload_records',
      new TableIndex({
        name: 'IDX_UPLOAD_RECORDS_CHANNEL',
        columnNames: ['channel_profile_id'],
      }),
    );

    await queryRunner.createIndex(
      'upload_records',
      new TableIndex({
        name: 'IDX_UPLOAD_RECORDS_YT_ID',
        columnNames: ['youtube_video_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('upload_records', true);
  }
}
