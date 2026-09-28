import { describe, expect, it } from 'vitest';
import { MigrationState, RepositoryMigration } from '../models/RepositoryMigration';
import { resolvers } from '../schema/resolvers';
import { makeMigrations } from './factories';

/**
 * CHARACTERIZATION TESTS — migration `duration`
 *
 * READ THIS BEFORE CHANGING DURATION BEHAVIOUR.
 *
 * MARS computes duration in processMigration() as:
 *
 *     duration = Date.now() - createdAt
 *
 * evaluated at the moment a sync observes state === SUCCEEDED.
 *
 * That is NOT how long the migration took. It is how old the migration was
 * when MARS happened to poll. A migration that ran for 4 minutes but was not
 * observed until the next 6-hourly sync records a duration of ~6 hours. The
 * value is therefore a function of the sync schedule, not of the migration.
 *
 * This matters because `averageDuration` feeds any queue/ETA forecasting.
 *
 * Root cause, confirmed against the GEI GraphQL reference: the
 * RepositoryMigration type exposes createdAt but NO completion timestamp
 * (no completedAt / startedAt / updatedAt). True duration cannot be read
 * from the API; it can only be estimated by recording state transitions
 * locally, with an error bound of roughly the sync interval.
 *
 * These tests pin the CURRENT behaviour so a V2 replacement is a visible,
 * deliberate diff rather than a silent change in what the number means.
 */

const stats = (enterpriseName: string) =>
  (resolvers.Query.enterpriseStats as any)(
    undefined,
    { enterpriseName },
    { token: 'test-token' },
  );

describe('duration — storage contract', () => {
  it('is stored in milliseconds', async () => {
    await makeMigrations([
      { repositoryName: 'a', state: MigrationState.SUCCEEDED, duration: 90_000 },
    ]);

    const doc = await RepositoryMigration.findOne({ repositoryName: 'a' });

    expect(doc?.duration).toBe(90_000);
  });

  it('is optional, and absent on migrations that never succeeded', async () => {
    await makeMigrations([
      { repositoryName: 'queued', state: MigrationState.QUEUED },
      { repositoryName: 'failed', state: MigrationState.FAILED },
    ]);

    const queued = await RepositoryMigration.findOne({ repositoryName: 'queued' });
    const failed = await RepositoryMigration.findOne({ repositoryName: 'failed' });

    expect(queued?.duration).toBeUndefined();
    expect(failed?.duration).toBeUndefined();
  });
});

describe('duration — what the current formula actually measures', () => {
  it('reflects observation lag, not migration time', async () => {
    // A migration created 6 hours ago, observed as SUCCEEDED right now.
    const createdAt = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const durationAsMarsComputesIt = Date.now() - createdAt.getTime();

    await makeMigrations([
      {
        repositoryName: 'slow-to-observe',
        state: MigrationState.SUCCEEDED,
        createdAt,
        duration: durationAsMarsComputesIt,
      },
    ]);

    const doc = await RepositoryMigration.findOne({ repositoryName: 'slow-to-observe' });

    // ~6 hours recorded — regardless of whether the migration took 4 minutes.
    expect(doc!.duration).toBeGreaterThan(5.9 * 60 * 60 * 1000);

    // The assertion that documents the bug: duration is tied to createdAt and
    // poll time, so it can never be shorter than the observation gap.
    const observationGap = Date.now() - createdAt.getTime();
    expect(doc!.duration).toBeCloseTo(observationGap, -4);
  });

  it('propagates the inflated value into averageDuration', async () => {
    // Two migrations that each really took ~1 minute, but were observed at
    // very different times. The average reflects polling, not performance.
    await makeMigrations([
      { repositoryName: 'observed-fast', state: MigrationState.SUCCEEDED, duration: 60_000 },
      { repositoryName: 'observed-late', state: MigrationState.SUCCEEDED, duration: 21_600_000 },
    ]);

    const result = await stats('acme');

    // 10.83 hours "average" for two one-minute migrations.
    expect(result.averageDuration).toBe(10_830_000);
  });
});

describe('duration — sorting and export consumers', () => {
  it('sorts by duration, placing migrations without one first in ASC', async () => {
    await makeMigrations([
      { repositoryName: 'long', state: MigrationState.SUCCEEDED, duration: 500_000 },
      { repositoryName: 'none', state: MigrationState.QUEUED },
      { repositoryName: 'short', state: MigrationState.SUCCEEDED, duration: 1_000 },
    ]);

    const result = await (resolvers.Query.allMigrations as any)(
      undefined,
      { orderBy: { field: 'DURATION', direction: 'ASC' } },
      {},
    );

    // Missing durations sort before present ones in MongoDB.
    expect(result.nodes.map((n: any) => n.repositoryName)).toEqual([
      'none',
      'short',
      'long',
    ]);
  });
});
