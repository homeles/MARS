import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { MigrationState } from '../models/RepositoryMigration';
import { makeMigrations } from './factories';

/**
 * CHARACTERIZATION TESTS — GET /api/migrations/export/csv
 *
 * Drives the real Express router rather than reimplementing the row builder,
 * so the test fails if the route changes shape.
 *
 * Pins the current CSV contract: column order, quoting, the minutes rounding
 * of duration, and the Content-Disposition filename. A UI revamp that changes
 * any of these breaks every saved spreadsheet and import script downstream.
 */

let app: express.Express;

beforeAll(async () => {
  const { migrationRoutes } = await import('../routes/migrationRoutes');
  app = express();
  app.use(express.json());
  app.use('/api/migrations', migrationRoutes);
});

const getCsv = () => request(app).get('/api/migrations/export/csv');

const parseRows = (body: string) => body.split('\n');

describe('CSV export — response envelope', () => {
  it('serves text/csv as a timestamped attachment', async () => {
    await makeMigrations([{ repositoryName: 'repo' }]);

    const res = await getCsv();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="migrations-export-.+\.csv"/,
    );
    // Lets browsers read the filename on a cross-origin download.
    expect(res.headers['access-control-expose-headers']).toBe('Content-Disposition');
  });

  it('returns a header row even with no migrations', async () => {
    const res = await getCsv();

    expect(res.status).toBe(200);
    expect(parseRows(res.text)).toHaveLength(1);
  });
});

describe('CSV export — columns', () => {
  it('emits the 16 documented columns in a fixed order', async () => {
    const res = await getCsv();

    expect(parseRows(res.text)[0]).toBe(
      [
        'Repository Name',
        'Organization',
        'Status',
        'Created At',
        'Duration (minutes)',
        'Warnings Count',
        'Failure Reason',
        'Enterprise Name',
        'Source URL',
        'GitHub ID',
        'Database ID',
        'Migration Log URL',
        'Migration Source ID',
        'Migration Source Name',
        'Migration Source Type',
        'Migration Source URL',
      ]
        .map((h) => `"${h}"`)
        .join(','),
    );
  });
});

describe('CSV export — values', () => {
  it('converts duration from milliseconds to whole minutes', async () => {
    await makeMigrations([
      // 90s -> 1.5min -> rounds to 2
      { repositoryName: 'ninety-sec', state: MigrationState.SUCCEEDED, duration: 90_000 },
    ]);

    const row = parseRows((await getCsv()).text)[1];

    expect(row.split(',')[4]).toBe('"2"');
  });

  it('leaves duration blank when absent', async () => {
    await makeMigrations([{ repositoryName: 'queued', state: MigrationState.QUEUED }]);

    const row = parseRows((await getCsv()).text)[1];

    expect(row.split(',')[4]).toBe('""');
  });

  it('writes createdAt as an ISO string', async () => {
    await makeMigrations([
      { repositoryName: 'repo', createdAt: new Date('2026-02-03T04:05:06.000Z') },
    ]);

    expect(parseRows((await getCsv()).text)[1]).toContain('"2026-02-03T04:05:06.000Z"');
  });

  it('sorts rows by createdAt descending', async () => {
    await makeMigrations([
      { repositoryName: 'older', createdAt: new Date('2026-01-01T00:00:00Z') },
      { repositoryName: 'newer', createdAt: new Date('2026-06-01T00:00:00Z') },
    ]);

    const rows = parseRows((await getCsv()).text);

    expect(rows[1]).toContain('newer');
    expect(rows[2]).toContain('older');
  });
});

describe('CSV export — escaping', () => {
  it('doubles embedded quotes', async () => {
    await makeMigrations([{ repositoryName: 'repo "quoted" name' }]);

    expect(parseRows((await getCsv()).text)[1]).toContain('"repo ""quoted"" name"');
  });

  it('keeps a comma inside a quoted field', async () => {
    await makeMigrations([
      {
        repositoryName: 'repo',
        state: MigrationState.FAILED,
        failureReason: 'timed out, then gave up',
      },
    ]);

    expect(parseRows((await getCsv()).text)[1]).toContain('"timed out, then gave up"');
  });

  it('CHARACTERIZATION: a newline in a field breaks row alignment', async () => {
    // Rows are joined with '\n' and embedded newlines are not escaped, so a
    // multi-line failureReason splits one record across several CSV lines.
    // RFC 4180 allows newlines inside quoted fields, but many naive parsers
    // (and this test's own split) then mis-read the file. Pinned as-is.
    await makeMigrations([
      {
        repositoryName: 'multiline',
        state: MigrationState.FAILED,
        failureReason: 'line one\nline two',
      },
    ]);

    const rows = parseRows((await getCsv()).text);

    // Header + 2 physical lines for a single logical record.
    expect(rows).toHaveLength(3);
    expect(rows[2]).toContain('line two');
  });
});
