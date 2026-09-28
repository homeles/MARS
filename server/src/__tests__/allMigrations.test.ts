import { describe, expect, it } from 'vitest';
import { MigrationState } from '../models/RepositoryMigration';
import { resolvers } from '../schema/resolvers';
import { makeMigrations } from './factories';

/**
 * CHARACTERIZATION TESTS — `allMigrations`
 *
 * These assert what MARS does TODAY, not what it ideally should do.
 * They exist so that a V2 change which alters any of this behaviour shows up
 * as an explicit, reviewable diff rather than a silent regression.
 *
 * Where current behaviour looks wrong, the test still pins the real behaviour
 * and says so in a comment. Do not "fix" a test to make a change pass —
 * change the test deliberately, and call it out in the PR.
 */

const allMigrations = (args: Record<string, unknown> = {}) =>
  (resolvers.Query.allMigrations as any)(undefined, args, {});

describe('allMigrations — filtering', () => {
  it('returns every migration when no filter is supplied', async () => {
    await makeMigrations([
      { repositoryName: 'alpha' },
      { repositoryName: 'beta' },
      { repositoryName: 'gamma' },
    ]);

    const result = await allMigrations();

    expect(result.totalCount).toBe(3);
    expect(result.nodes).toHaveLength(3);
  });

  it('filters by state', async () => {
    await makeMigrations([
      { repositoryName: 'ok', state: MigrationState.SUCCEEDED },
      { repositoryName: 'bad', state: MigrationState.FAILED },
      { repositoryName: 'waiting', state: MigrationState.QUEUED },
    ]);

    const result = await allMigrations({ state: MigrationState.FAILED });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].repositoryName).toBe('bad');
  });

  it('filters by enterpriseName and organizationName independently', async () => {
    await makeMigrations([
      { repositoryName: 'a', enterpriseName: 'acme', organizationName: 'org-1' },
      { repositoryName: 'b', enterpriseName: 'acme', organizationName: 'org-2' },
      { repositoryName: 'c', enterpriseName: 'other', organizationName: 'org-1' },
    ]);

    expect((await allMigrations({ enterpriseName: 'acme' })).totalCount).toBe(2);
    expect((await allMigrations({ organizationName: 'org-1' })).totalCount).toBe(2);
    expect(
      (await allMigrations({ enterpriseName: 'acme', organizationName: 'org-1' })).totalCount,
    ).toBe(1);
  });
});

describe('allMigrations — search', () => {
  it('matches repositoryName, organizationName, state and failureReason', async () => {
    await makeMigrations([
      { repositoryName: 'payments-api', organizationName: 'org-1' },
      { repositoryName: 'unrelated', organizationName: 'payments-team' },
      {
        repositoryName: 'broken',
        organizationName: 'org-2',
        state: MigrationState.FAILED,
        failureReason: 'payments quota exceeded',
      },
    ]);

    const result = await allMigrations({ search: 'payments' });

    // All three match, each via a different field.
    expect(result.totalCount).toBe(3);
  });

  it('is case-insensitive', async () => {
    await makeMigrations([{ repositoryName: 'PaymentsAPI' }]);

    expect((await allMigrations({ search: 'paymentsapi' })).totalCount).toBe(1);
  });

  it('treats the search term as a regex, not a literal string', async () => {
    // CHARACTERIZATION OF A BUG: `search` is interpolated straight into
    // `$regex` with no escaping, so regex metacharacters are interpreted.
    // A user searching for "a.b" also matches "axb". A malformed pattern
    // such as "(" makes the resolver throw rather than return no results.
    await makeMigrations([{ repositoryName: 'axb' }]);

    expect((await allMigrations({ search: 'a.b' })).totalCount).toBe(1);
    await expect(allMigrations({ search: '(' })).rejects.toThrow();
  });
});

describe('allMigrations — pagination', () => {
  it('honours pageSize and page', async () => {
    await makeMigrations(
      Array.from({ length: 25 }, (_, i) => ({
        repositoryName: `repo-${String(i).padStart(2, '0')}`,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      })),
    );

    const page1 = await allMigrations({ pageSize: 10, page: 1 });
    const page3 = await allMigrations({ pageSize: 10, page: 3 });

    expect(page1.nodes).toHaveLength(10);
    expect(page1.pageInfo).toMatchObject({
      currentPage: 1,
      totalPages: 3,
      hasPreviousPage: false,
      hasNextPage: true,
    });

    // Final page is partial.
    expect(page3.nodes).toHaveLength(5);
    expect(page3.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
  });

  it('returns every record when pageSize is -1', async () => {
    await makeMigrations(
      Array.from({ length: 12 }, (_, i) => ({ repositoryName: `repo-${i}` })),
    );

    const result = await allMigrations({ pageSize: -1 });

    expect(result.nodes).toHaveLength(12);
    expect(result.pageInfo.totalPages).toBe(1);
  });

  it('clamps an out-of-range page to the last page', async () => {
    await makeMigrations(
      Array.from({ length: 5 }, (_, i) => ({ repositoryName: `repo-${i}` })),
    );

    const result = await allMigrations({ pageSize: 2, page: 99 });

    expect(result.pageInfo.currentPage).toBe(3);
    expect(result.nodes).toHaveLength(1);
  });

  it('caps pageSize at 1000', async () => {
    await makeMigrations([{ repositoryName: 'only' }]);

    const result = await allMigrations({ pageSize: 99_999 });

    // Not an error — silently clamped.
    expect(result.nodes).toHaveLength(1);
  });

  it('throws when the collection is empty and pageSize is -1', async () => {
    // CHARACTERIZATION OF A BUG: with no documents, `limit` becomes 0, and
    // Mongoose rejects `.limit(0)`... but totalPages also divides by 0.
    // Pinning whatever happens today so a V2 fix is visible.
    const result = await allMigrations({ pageSize: -1 }).catch((e: Error) => e);

    if (result instanceof Error) {
      expect(result).toBeInstanceOf(Error);
    } else {
      expect(result.nodes).toHaveLength(0);
      // 0/0 === NaN in JS.
      expect(Number.isNaN(result.pageInfo.totalPages)).toBe(true);
    }
  });
});

describe('allMigrations — sorting', () => {
  it('defaults to ascending createdAt', async () => {
    await makeMigrations([
      { repositoryName: 'newest', createdAt: new Date('2026-03-01T00:00:00Z') },
      { repositoryName: 'oldest', createdAt: new Date('2026-01-01T00:00:00Z') },
      { repositoryName: 'middle', createdAt: new Date('2026-02-01T00:00:00Z') },
    ]);

    const result = await allMigrations();

    expect(result.nodes.map((n: any) => n.repositoryName)).toEqual([
      'oldest',
      'middle',
      'newest',
    ]);
  });

  it('sorts by repository name case-insensitively via collation', async () => {
    await makeMigrations([
      { repositoryName: 'banana' },
      { repositoryName: 'Apple' },
      { repositoryName: 'cherry' },
    ]);

    const result = await allMigrations({
      orderBy: { field: 'REPOSITORY_NAME', direction: 'ASC' },
    });

    // Without collation strength 2, 'Apple' would sort after lowercase names.
    expect(result.nodes.map((n: any) => n.repositoryName)).toEqual([
      'Apple',
      'banana',
      'cherry',
    ]);
  });

  it('supports DESC direction', async () => {
    await makeMigrations([
      { repositoryName: 'a', warningsCount: 1 },
      { repositoryName: 'b', warningsCount: 9 },
      { repositoryName: 'c', warningsCount: 5 },
    ]);

    const result = await allMigrations({
      orderBy: { field: 'WARNINGS_COUNT', direction: 'DESC' },
    });

    expect(result.nodes.map((n: any) => n.warningsCount)).toEqual([9, 5, 1]);
  });

  it('falls back to createdAt for an unrecognised orderBy field', async () => {
    await makeMigrations([
      { repositoryName: 'second', createdAt: new Date('2026-02-01T00:00:00Z') },
      { repositoryName: 'first', createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const result = await allMigrations({
      orderBy: { field: 'NOT_A_REAL_FIELD', direction: 'ASC' },
    });

    expect(result.nodes[0].repositoryName).toBe('first');
  });
});

describe('allMigrations — state counts', () => {
  it('reports per-state counts alongside the page', async () => {
    await makeMigrations([
      { repositoryName: 'ok-1', state: MigrationState.SUCCEEDED },
      { repositoryName: 'ok-2', state: MigrationState.SUCCEEDED },
      { repositoryName: 'fail-1', state: MigrationState.FAILED },
      { repositoryName: 'fail-2', state: MigrationState.FAILED_VALIDATION },
      { repositoryName: 'run-1', state: MigrationState.IN_PROGRESS },
      { repositoryName: 'run-2', state: MigrationState.NOT_STARTED },
      { repositoryName: 'run-3', state: MigrationState.PENDING_VALIDATION },
      { repositoryName: 'queued-1', state: MigrationState.QUEUED },
    ]);

    const result = await allMigrations({ pageSize: 2 });

    // Counts cover the whole filtered set, not just the returned page.
    expect(result.nodes).toHaveLength(2);
    expect(result.totalCount).toBe(8);
    expect(result.completedCount).toBe(2);
    // FAILED and FAILED_VALIDATION are collapsed together.
    expect(result.failedCount).toBe(2);
    // IN_PROGRESS, NOT_STARTED and PENDING_VALIDATION are collapsed together.
    expect(result.inProgressCount).toBe(3);
    expect(result.queuedMigrations).toBe(1);
  });

  it('applies the active filter to the counts', async () => {
    await makeMigrations([
      { repositoryName: 'a', enterpriseName: 'acme', state: MigrationState.SUCCEEDED },
      { repositoryName: 'b', enterpriseName: 'other', state: MigrationState.SUCCEEDED },
    ]);

    const result = await allMigrations({ enterpriseName: 'acme' });

    expect(result.totalCount).toBe(1);
    expect(result.completedCount).toBe(1);
  });
});

describe('allMigrations — node shape', () => {
  it('exposes the Mongo _id as `id` and createdAt as an ISO string', async () => {
    await makeMigrations([{ repositoryName: 'repo' }]);

    const node = (await allMigrations()).nodes[0];

    expect(node.id).toMatch(/^[a-f0-9]{24}$/);
    expect(node.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(node.migrationSource).toMatchObject({ type: 'GITHUB_ARCHIVE' });
  });
});
