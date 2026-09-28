import { MigrationState, RepositoryMigration } from '../models/RepositoryMigration';

/**
 * Builds a RepositoryMigration document with sane defaults.
 *
 * Field shapes mirror what the GEI GraphQL API actually returns for
 * `RepositoryMigration` (see docs/graphql/reference/migrations): the API
 * exposes createdAt but has NO completion timestamp, which is why `duration`
 * is a MARS-computed value rather than an API field.
 */
export async function makeMigration(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    githubId: `MG_${Math.random().toString(36).slice(2, 11)}`,
    databaseId: '12345',
    sourceUrl: 'https://github.com/source-org/repo',
    state: MigrationState.SUCCEEDED,
    warningsCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    repositoryName: 'repo',
    enterpriseName: 'acme',
    organizationName: 'acme-org',
    migrationSource: {
      id: 'MS_kgC',
      name: 'GitHub.com source',
      type: 'GITHUB_ARCHIVE',
      url: 'https://github.com',
    },
    ...overrides,
  };

  return RepositoryMigration.create(base as never);
}

/** Creates several migrations in order, returning them as an array. */
export async function makeMigrations(
  specs: Array<Partial<Record<string, unknown>>>,
) {
  const out: Awaited<ReturnType<typeof makeMigration>>[] = [];
  for (const spec of specs) {
    out.push(await makeMigration(spec));
  }
  return out;
}
