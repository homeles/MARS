import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncHistory extends Document {
  enterpriseName: string;
  syncId: string;
  startTime: Date;
  endTime?: Date;
  organizations: {
    login: string;
    totalMigrations: number;
    totalPages: number;
    latestMigrationDate?: Date;
    errors?: string[];
    elapsedTimeMs: number;
  }[];
  status: 'in-progress' | 'completed' | 'failed';
  completedOrganizations: number;
  totalOrganizations: number;
}

const SyncHistorySchema: Schema = new Schema({
  enterpriseName: { type: String, required: true },
  syncId: { type: String, required: true, unique: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  organizations: [{
    login: { type: String, required: true },
    totalMigrations: { type: Number, default: 0 },
    totalPages: { type: Number, default: 0 },
    latestMigrationDate: { type: Date },
    errors: [{ type: String }],
    elapsedTimeMs: { type: Number, default: 0 }
  }],
  status: { 
    type: String, 
    required: true, 
    enum: ['in-progress', 'completed', 'failed'],
    default: 'in-progress'
  },
  completedOrganizations: { type: Number, default: 0 },
  totalOrganizations: { type: Number, required: true }
}, { timestamps: true });

// Add index for efficient queries
// No need to index syncId here since it's already marked as unique in the schema definition
SyncHistorySchema.index({ enterpriseName: 1 });
SyncHistorySchema.index({ status: 1 });

export const SyncHistory = mongoose.model<ISyncHistory>('SyncHistory', SyncHistorySchema);
