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
  repositoryName: string;
  createdAt: string;
  state: MigrationState;
  warningsCount: number;
  failureReason?: string;
  organizationName: string;
  targetOrganizationName?: string;
  duration?: number;
  enterpriseName: string;
  migrationSource?: MigrationSource;
}