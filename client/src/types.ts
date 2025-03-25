export enum MigrationState {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN'
}

export interface Migration {
  id: string;
  repositoryName: string;
  createdAt: string;
  state: MigrationState;
  failureReason?: string;
  migrationLogUrl?: string;
  enterpriseName?: string;
  completedAt?: string;
  duration?: string;
}