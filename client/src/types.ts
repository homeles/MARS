export enum MigrationState {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  FAILED = 'FAILED',
  SUCCEEDED = 'SUCCEEDED',
  NOT_STARTED = 'NOT_STARTED'
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
  completedAt?: string;
  organizationName: string;
  targetOrganizationName?: string;
  duration?: number;
  enterpriseName: string;
  migrationSource?: MigrationSource;
}