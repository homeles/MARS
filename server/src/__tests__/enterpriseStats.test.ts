import { describe, expect, it } from 'vitest';
import { MigrationState } from '../models/RepositoryMigration';
import { resolvers } from '../schema/resolvers';
import { makeMigrations } from './factories';

/**
 * CHARACTERIZATION TESTS — `enterpriseStats`
 *
 * Pins today's behaviour. `enterpriseStats` is the aggregate that any future
 * queue-forecasting feature would build on, so its current semantics — and
 * its current flaws — need to be explicit before V2 changes them.
 */

const stats = (enterpriseName: string) =>
  (resolvers.Query.enterpriseStats as any)(
    undefined,
    { enterpriseName },
    { token: 'test-token' },
  );

describe('enterpriseStats — authentication', () => {
  it('requires a token', async () => {
    await expect(
      (resolvers.Query.enterpriseStats as any)(undefined, { enterpriseName: 'acme' }, {}),
    ).rejects.toThrow('Authentication token is required');
  });
});

describe('enterpriseStats — counting', () => {
  it('groups states the same way the dashboard cards expect', async () => {
    await makeMigrations([
      { repositoryName: 'ok-1', state: MigrationState.SUCCEEDED },
      { repositoryName: 'ok-2', state: MigrationState.SUCCEEDED },
      { repositoryName: 'f-1', state: MigrationState.FAILED },
      { repositoryName: 'f-2', state: MigrationState.FAILED_VALIDATION },
      { repositoryName: 'p-1', state: MigrationState.IN_PROGRESS },
      { repositoryName: 'p-2', state: MigrationState.NOT_STARTED },
      { repositoryName: 'p-3', state: MigrationState.PENDING_VALIDATION },
      { repositoryName: 'q-1', state: MigrationState.QUEUED },
      { repositoryName: 'q-2', state: MigrationState.QUEUED },
    ]);

    const result = await stats('acme');

    expect(result.totalMigrations).toBe(9);
    expect(result.completedMigrations).toBe(2);
    // FAILED + FAILED_VALIDATION collapse into one bucket.
    expect(result.failedMigrations).toBe(2);
    // IN_PROGRESS + NOT_STARTED + PENDING_VALIDATION collapse into one bucket.
    expect(result.inProgressMigrations).toBe(3);
    expect(result.queuedMigrations).toBe(2);
  });

  it('scopes counts to the requested enterprise', async () => {
    await makeMigrations([
      { repositoryName: 'a', enterpriseName: 'acme' },
      { repositoryName: 'b', enterpriseName: 'globex' },
    ]);

    expect((await stats('acme')).totalMigrations).toBe(1);
    expect((await stats('globex')).totalMigrations).toBe(1);
  });

  it('returns zeroes for an enterprise with no migrations', async () => {
    const result = await stats('nobody');

    expect(result).toMatchObject({
      totalMigrations: 0,
      completedMigrations: 0,
      failedMigrations: 0,
      inProgressMigrations: 0,
      queuedMigrations: 0,
      averageDuration: null,
    });
  });

  it('every state falls into exactly one bucket', async () => {
    // Guards against a future state being added to the enum but missed here.
    await makeMigrations(
      Object.values(MigrationState).map((state, i) => ({
        repositoryName: `repo-${i}`,
        state,
      })),
    );

    const r = await stats('acme');
    const bucketed =
      r.completedMigrations +
      r.failedMigrations +
      r.inProgressMigrations +
      r.queuedMigrations;

    expect(bucketed).toBe(r.totalMigrations);
  });
});

describe('enterpriseStats — averageDuration', () => {
  it('averages only SUCCEEDED migrations that have a duration', async () => {
    await makeMigrations([
      { repositoryName: 'a', state: MigrationState.SUCCEEDED, duration: 60_000 },
      { repositoryName: 'b', state: MigrationState.SUCCEEDED, duration: 120_000 },
      // No duration — must not drag the average down.
      { repositoryName: 'c', state: MigrationState.SUCCEEDED },
      // Not SUCCEEDED — excluded even though it has a duration.
      { repositoryName: 'd', state: MigrationState.FAILED, duration: 999_000 },
    ]);

    const result = await stats('acme');

    expect(result.averageDuration).toBe(90_000);
  });

  it('is null when no SUCCEEDED migration has a duration', async () => {
    await makeMigrations([
      { repositoryName: 'a', state: MigrationState.QUEUED },
      { repositoryName: 'b', state: MigrationState.FAILED, duration: 5_000 },
    ]);

    expect((await stats('acme')).averageDuration).toBeNull();
  });
});
