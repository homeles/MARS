export enum MigrationState {
  FAILED = 'FAILED',
  FAILED_VALIDATION = 'FAILED_VALIDATION',
  IN_PROGRESS = 'IN_PROGRESS',
  NOT_STARTED = 'NOT_STARTED',
  PENDING_VALIDATION = 'PENDING_VALIDATION',
  QUEUED = 'QUEUED',
  SUCCEEDED = 'SUCCEEDED'
}

export interface MigrationSource {
  id: string;
  name: string;
  type: string;
  url: string;
}

export interface Migration {
  id: string;
  githubId: string;
  databaseId?: string;
  repositoryName: string;
  sourceUrl?: string;
  state: MigrationState;
  warningsCount: number;
  failureReason?: string;
  createdAt: string;
  organizationName: string;
  targetOrganizationName?: string;
  duration?: number;
  enterpriseName: string;
  migrationLogUrl?: string;
  migrationSource?: MigrationSource;
}