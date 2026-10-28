import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitialBaseline1730160000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. channel_profiles
    await queryRunner.createTable(
      new Table({
        name: 'channel_profiles',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'niche',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'target_regions',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'language',
            type: 'varchar',
            length: '10',
            default: "'en'",
          },
          {
            name: 'youtube_channel_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'encrypted_oauth_tokens',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)',
          },
        ],
      }),
      true,
    );

    // 2. video_projects
    await queryRunner.createTable(
      new Table({
        name: 'video_projects',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'channel_profile_id',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'working_title',
            type: 'varchar',
            length: '255',
            default: "''",
          },
          {
            name: 'topic',
            type: 'text',
          },
          {
            name: 'target_audience',
            type: 'varchar',
            length: '255',
            default: "'General Audience'",
          },
          {
            name: 'format',
            type: 'enum',
            enum: ['long_form', 'short'],
            default: "'long_form'",
          },
          {
            name: 'target_duration_seconds',
            type: 'int',
            default: 300,
          },
          {
            name: 'status',
            type: 'enum',
            enum: [
              'idea',
              'researching',
              'script_draft',
              'script_review',
              'script_approved',
              'assets_pending',
              'ready_to_render',
              'rendering',
              'render_review',
              'render_approved',
              'ready_to_upload',
              'uploading',
              'uploaded_private',
              'release_review',
              'scheduled_or_public',
              'failed',
              'archived',
            ],
            default: "'idea'",
          },
          {
            name: 'script_version',
            type: 'int',
            default: 1,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)',
          },
        ],
      }),
      true,
    );

    // Foreign key for video_projects -> channel_profiles
    await queryRunner.createForeignKey(
      'video_projects',
      new TableForeignKey({
        columnNames: ['channel_profile_id'],
        referencedTableName: 'channel_profiles',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Indexes for video_projects
    await queryRunner.createIndex(
      'video_projects',
      new TableIndex({
        name: 'IDX_video_projects_channel',
        columnNames: ['channel_profile_id'],
      }),
    );
    await queryRunner.createIndex(
      'video_projects',
      new TableIndex({
        name: 'IDX_video_projects_status',
        columnNames: ['status'],
      }),
    );

    // 3. audit_events
    await queryRunner.createTable(
      new Table({
        name: 'audit_events',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'actor',
            type: 'varchar',
            length: '100',
            default: "'system'",
          },
          {
            name: 'action',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'entity_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'entity_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'details_json',
            type: 'json',
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

    await queryRunner.createIndex(
      'audit_events',
      new TableIndex({
        name: 'IDX_audit_events_action',
        columnNames: ['action'],
      }),
    );
    await queryRunner.createIndex(
      'audit_events',
      new TableIndex({
        name: 'IDX_audit_events_entity',
        columnNames: ['entity_type', 'entity_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_events');
    await queryRunner.dropTable('video_projects');
    await queryRunner.dropTable('channel_profiles');
  }
}
