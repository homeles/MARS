import mongoose, { Schema, Document } from 'mongoose';

export interface IUserPreference extends Document {
  key: string;
  value: string;
}

const UserPreferenceSchema: Schema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
}, { timestamps: true });

export const UserPreference = mongoose.model<IUserPreference>('UserPreference', UserPreferenceSchema);
