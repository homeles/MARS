import mongoose, { Document, Schema, Types } from 'mongoose';

export enum MigrationState {
  FAILED = 'FAILED',
  FAILED_VALIDATION = 'FAILED_VALIDATION',
  IN_PROGRESS = 'IN_PROGRESS',
  NOT_STARTED = 'NOT_STARTED',
  PENDING_VALIDATION = 'PENDING_VALIDATION',
  QUEUED = 'QUEUED',
  SUCCEEDED = 'SUCCEEDED'
}

export interface IMigrationSource {
  id: string;
  name: string;
  type: string;
  url: string;
}

export interface IRepositoryMigration extends Document {
  _id: Types.ObjectId;
  githubId: string;
  databaseId?: string;
  sourceUrl?: string;
  state: MigrationState;
  warningsCount: number;
  failureReason?: string;
  createdAt: Date;
  repositoryName: string;
  duration?: number;
  enterpriseName: string;
  organizationName: string;
  targetOrganizationName?: string;
  migrationLogUrl?: string;
  migrationSource?: IMigrationSource;
}

export interface IOrgAccessStatus extends Document {
  orgId: string;
  orgLogin: string;
  hasAccess: boolean;
  errorMessage?: string;
  lastChecked: Date;
  enterpriseName: string;
}

const migrationSourceSchema = new Schema<IMigrationSource>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  url: { type: String, required: true }
});

const repositoryMigrationSchema = new Schema<IRepositoryMigration>({
  githubId: { type: String, required: true, unique: true },
  databaseId: { type: String },
  sourceUrl: { type: String },
  state: { 
    type: String, 
    required: true,
    enum: Object.values(MigrationState),
    default: MigrationState.NOT_STARTED
  },
  warningsCount: { type: Number, default: 0 },
  failureReason: { type: String },
  createdAt: { type: Date, required: true },
  repositoryName: { type: String, required: true },
  duration: { type: Number },
  enterpriseName: { type: String, required: true },
  organizationName: { type: String, required: true },
  targetOrganizationName: { type: String },
  migrationLogUrl: { type: String },
  migrationSource: { type: migrationSourceSchema }
}, {
  timestamps: true
});

const orgAccessStatusSchema = new Schema<IOrgAccessStatus>({
  orgId: { type: String, required: true },
  orgLogin: { type: String, required: true },
  hasAccess: { type: Boolean, required: true },
  errorMessage: { type: String },
  lastChecked: { type: Date, required: true },
  enterpriseName: { type: String, required: true }
});

export const RepositoryMigration = mongoose.model<IRepositoryMigration>('RepositoryMigration', repositoryMigrationSchema);
export const OrgAccessStatus = mongoose.model<IOrgAccessStatus>('OrgAccessStatus', orgAccessStatusSchema);