import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class TopicsResearchScripts1730160100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. topics
    await queryRunner.createTable(
      new Table({
        name: 'topics',
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
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'niche',
            type: 'varchar',
            length: '100',
            default: "'General'",
          },
          {
            name: 'target_audience',
            type: 'varchar',
            length: '255',
            default: "'General Audience'",
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['low', 'medium', 'high'],
            default: "'medium'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['idea', 'planned', 'converted', 'archived'],
            default: "'idea'",
          },
          {
            name: 'converted_project_id',
            type: 'varchar',
            length: '36',
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

    await queryRunner.createForeignKey(
      'topics',
      new TableForeignKey({
        columnNames: ['channel_profile_id'],
        referencedTableName: 'channel_profiles',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'topics',
      new TableIndex({
        name: 'IDX_topics_channel',
        columnNames: ['channel_profile_id'],
      }),
    );

    // 2. research_sources
    await queryRunner.createTable(
      new Table({
        name: 'research_sources',
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
            name: 'url',
            type: 'text',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'publisher',
            type: 'varchar',
            length: '255',
            default: "'Independent Source'",
          },
          {
            name: 'published_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'accessed_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'claim_supported',
            type: 'text',
          },
          {
            name: 'source_type',
            type: 'varchar',
            length: '50',
            default: "'article'",
          },
          {
            name: 'verification_status',
            type: 'enum',
            enum: ['verified', 'unverified', 'disputed'],
            default: "'unverified'",
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
      'research_sources',
      new TableForeignKey({
        columnNames: ['video_project_id'],
        referencedTableName: 'video_projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'research_sources',
      new TableIndex({
        name: 'IDX_research_sources_project',
        columnNames: ['video_project_id'],
      }),
    );

    // 3. scripts
    await queryRunner.createTable(
      new Table({
        name: 'scripts',
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
            name: 'version',
            type: 'int',
            default: 1,
          },
          {
            name: 'content',
            type: 'longtext',
          },
          {
            name: 'outline_json',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'scene_plan_json',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'metadata_json',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            default: "'mock'",
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            default: "'mock-engine-v1'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'review', 'approved', 'superseded'],
            default: "'draft'",
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
      'scripts',
      new TableForeignKey({
        columnNames: ['video_project_id'],
        referencedTableName: 'video_projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'scripts',
      new TableIndex({
        name: 'IDX_scripts_project',
        columnNames: ['video_project_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('scripts');
    await queryRunner.dropTable('research_sources');
    await queryRunner.dropTable('topics');
  }
}
