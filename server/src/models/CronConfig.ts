import mongoose, { Schema, Document } from 'mongoose';

export interface ICronConfig extends Document {
  enterpriseName: string;
  schedule: string;  // Cron expression
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CronConfigSchema: Schema = new Schema({
  enterpriseName: { type: String, required: true, unique: true },
  schedule: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  lastRun: { type: Date },
  nextRun: { type: Date }
}, { 
  timestamps: true 
});

export const CronConfig = mongoose.model<ICronConfig>('CronConfig', CronConfigSchema);
