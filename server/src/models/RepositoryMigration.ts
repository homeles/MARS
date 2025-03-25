import mongoose, { Document, Schema } from 'mongoose';

export enum MigrationState {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

export interface IRepositoryMigration extends Document {
  githubId: string;
  repositoryName: string;
  createdAt: Date;
  state: MigrationState;
  failureReason?: string;
  migrationLogUrl?: string;
  enterpriseName: string;
  completedAt?: Date;
  duration?: number; // Duration in milliseconds
}

const repositoryMigrationSchema = new Schema<IRepositoryMigration>({
  githubId: { type: String, required: true, unique: true },
  repositoryName: { type: String, required: true },
  createdAt: { type: Date, required: true },
  state: { 
    type: String, 
    required: true,
    enum: Object.values(MigrationState),
    default: MigrationState.UNKNOWN 
  },
  failureReason: { type: String },
  migrationLogUrl: { type: String },
  enterpriseName: { type: String, required: true },
  completedAt: { type: Date },
  duration: { type: Number },
}, {
  timestamps: true, // Adds createdAt and updatedAt timestamps
});

// Calculate duration when completedAt is set
repositoryMigrationSchema.pre('save', function(next) {
  if (this.completedAt && this.createdAt) {
    this.duration = this.completedAt.getTime() - this.createdAt.getTime();
  }
  next();
});

export const RepositoryMigration = mongoose.model<IRepositoryMigration>('RepositoryMigration', repositoryMigrationSchema);