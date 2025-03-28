import mongoose, { Document, Schema, Types } from 'mongoose';

export enum MigrationState {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  FAILED = 'FAILED',
  SUCCEEDED = 'SUCCEEDED',
  NOT_STARTED = 'NOT_STARTED'
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
  downloadUrl?: string;
  excludeAttachments: boolean;
  excludeGitData: boolean;
  excludeOwnerProjects: boolean;
  excludeReleases: boolean;
  locked: boolean;
  sourceUrl?: string;
  state: MigrationState;
  warningsCount: number;
  failureReason?: string;
  createdAt: Date;
  repositoryName: string;
  completedAt?: Date;
  duration?: number; // Duration in milliseconds
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
  databaseId: { type: String },  // Changed from Number to String
  downloadUrl: { type: String },
  excludeAttachments: { type: Boolean, default: false },
  excludeGitData: { type: Boolean, default: false },
  excludeOwnerProjects: { type: Boolean, default: false },
  excludeReleases: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
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
  completedAt: { type: Date },
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

// Calculate duration when completedAt is set
repositoryMigrationSchema.pre('save', function(next) {
  if (this.completedAt && this.createdAt) {
    this.duration = this.completedAt.getTime() - this.createdAt.getTime();
  }
  next();
});

export const RepositoryMigration = mongoose.model<IRepositoryMigration>('RepositoryMigration', repositoryMigrationSchema);
export const OrgAccessStatus = mongoose.model<IOrgAccessStatus>('OrgAccessStatus', orgAccessStatusSchema);