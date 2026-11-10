import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive only: appends one value to two enum columns. No rows are changed and no columns are added or removed.
 *   background_jobs.job_type  + 'countryballs_render'  (Countryballs animation render job)
 *   assets.license_type       + 'stock_license'        (stock library licences such as Pexels; not Creative Commons)
 * Appending a value at the end of a MySQL ENUM keeps every existing value and its stored index.
 *
 * down() puts the old lists back, but refuses while any row uses a new value, so nothing is ever silently
 * converted or lost.
 */
export class CountryballsJobs1730160500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `background_jobs` MODIFY COLUMN `job_type` ENUM('render','upload','maintenance','countryballs_render') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `assets` MODIFY COLUMN `license_type` ENUM('user_created','public_domain','creative_commons','purchased_license','fair_use_quoted','stock_license') NOT NULL DEFAULT 'user_created'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const count = async (sql: string): Promise<number> => {
      const rows = await queryRunner.query(sql);
      return Number(rows?.[0]?.n ?? 0);
    };
    const jobs = await count("SELECT COUNT(*) AS n FROM `background_jobs` WHERE `job_type` = 'countryballs_render'");
    const assets = await count("SELECT COUNT(*) AS n FROM `assets` WHERE `license_type` = 'stock_license'");
    if (jobs > 0 || assets > 0) {
      throw new Error(
        `Refusing to revert CountryballsJobs: ${jobs} job(s) use 'countryballs_render' and ${assets} asset(s) use 'stock_license'. ` +
          'Reverting would invalidate those rows. Nothing was changed.',
      );
    }
    await queryRunner.query(
      "ALTER TABLE `background_jobs` MODIFY COLUMN `job_type` ENUM('render','upload','maintenance') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `assets` MODIFY COLUMN `license_type` ENUM('user_created','public_domain','creative_commons','purchased_license','fair_use_quoted') NOT NULL DEFAULT 'user_created'",
    );
  }
}
