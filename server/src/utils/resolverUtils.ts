import { UserPreference, IUserPreference } from '../models/UserPreference';
import { SyncHistory, ISyncHistory } from '../models/SyncHistory';
import { pubsub, SYNC_HISTORY_UPDATED } from '../index';
import { withFilter } from 'graphql-subscriptions';

// User Preference resolver functions
export const userPreferenceResolvers = {
  Query: {
    userPreferences: async (_: any, { keys }: { keys?: string[] }) => {
      try {
        // If keys are provided, only return those specific preferences
        if (keys && keys.length > 0) {
          return await UserPreference.find({ key: { $in: keys } });
        }
        // Otherwise return all preferences
        return await UserPreference.find({});
      } catch (error) {
        console.error('Error fetching user preferences:', error);
        throw new Error('Failed to fetch user preferences');
      }
    },
  },
  
  Mutation: {
    saveUserPreference: async (_: any, { key, value }: { key: string, value: string }) => {
      try {
        // Use upsert to update if exists or create if doesn't exist
        const preference = await UserPreference.findOneAndUpdate(
          { key },
          { key, value },
          { upsert: true, new: true, runValidators: true }
        );
        // Return a plain object with just the needed fields to avoid type issues
        return preference ? { key: preference.key, value: preference.value } : null;
      } catch (error) {
        console.error('Error saving user preference:', error);
        throw new Error('Failed to save user preference');
      }
    },
    
    saveUserPreferences: async (_: any, { preferences }: { preferences: { key: string, value: string }[] }) => {
      try {
        const results = [];
        
        // Process each preference
        for (const { key, value } of preferences) {
          const preference = await UserPreference.findOneAndUpdate(
            { key },
            { key, value },
            { upsert: true, new: true, runValidators: true }
          );
          
          // Return only the needed fields as a plain object to avoid type issues
          if (preference) {
            results.push({ key: preference.key, value: preference.value });
          }
        }
        
        return results;
      } catch (error) {
        console.error('Error saving user preferences:', error);
        throw new Error('Failed to save user preferences');
      }
    },
    
    deleteUserPreference: async (_: any, { key }: { key: string }) => {
      try {
        const result = await UserPreference.deleteOne({ key });
        return result.deletedCount > 0;
      } catch (error) {
        console.error('Error deleting user preference:', error);
        throw new Error('Failed to delete user preference');
      }
    },
  },
};

// Sync History resolver functions
export const syncHistoryResolvers = {
  Query: {
    syncHistory: async (_: any, { syncId }: { syncId: string }) => {
      try {
        return await SyncHistory.findOne({ syncId });
      } catch (error) {
        console.error('Error fetching sync history:', error);
        throw new Error('Failed to fetch sync history');
      }
    },
    
    syncHistories: async (_: any, { 
      enterpriseName, 
      limit = 10, 
      offset = 0 
    }: { 
      enterpriseName: string, 
      limit?: number, 
      offset?: number 
    }) => {
      try {
        return await SyncHistory.find({ enterpriseName })
          .sort({ startTime: -1 })
          .skip(offset)
          .limit(limit);
      } catch (error) {
        console.error('Error fetching sync histories:', error);
        throw new Error('Failed to fetch sync histories');
      }
    },
  },
  
  Subscription: {
    syncHistoryUpdated: {
      subscribe: withFilter(
        () => {
          // @ts-ignore - TypeScript doesn't properly recognize the asyncIterator method
          return pubsub.asyncIterator(SYNC_HISTORY_UPDATED);
        },
        (payload, variables) => {
          // Filter based on enterpriseName or syncId if provided
          if (variables.syncId) {
            return payload.syncHistoryUpdated.syncId === variables.syncId &&
                  payload.syncHistoryUpdated.enterpriseName === variables.enterpriseName;
          }
          return payload.syncHistoryUpdated.enterpriseName === variables.enterpriseName;
        }
      ),
    },
  },
};

// Helper functions for sync history management
export async function createSyncHistory(enterpriseName: string, syncId: string, orgs: string[]): Promise<ISyncHistory> {
  try {
    const syncHistory = new SyncHistory({
      enterpriseName,
      syncId,
      organizations: orgs.map(login => ({
        login,
        totalMigrations: 0,
        totalPages: 0,
        elapsedTimeMs: 0
      })),
      status: 'in-progress',
      completedOrganizations: 0,
      totalOrganizations: orgs.length
    });
    
    await syncHistory.save();
    
    // Publish update so clients can see the new sync history
    pubsub.publish(SYNC_HISTORY_UPDATED, {
      syncHistoryUpdated: syncHistory
    });
    
    return syncHistory;
  } catch (error) {
    console.error('Error creating sync history:', error);
    throw new Error('Failed to create sync history');
  }
}

export async function updateSyncHistory(syncId: string, updates: Partial<ISyncHistory>): Promise<ISyncHistory | null> {
  try {
    const syncHistory = await SyncHistory.findOneAndUpdate(
      { syncId },
      updates,
      { new: true }
    );
    
    if (syncHistory) {
      // Publish update
      pubsub.publish(SYNC_HISTORY_UPDATED, {
        syncHistoryUpdated: syncHistory
      });
    }
    
    return syncHistory;
  } catch (error) {
    console.error('Error updating sync history:', error);
    throw new Error('Failed to update sync history');
  }
}

export async function updateOrgSyncHistory(
  syncId: string, 
  orgLogin: string,
  updates: {
    totalMigrations?: number;
    totalPages?: number;
    latestMigrationDate?: Date;
    error?: string;
    elapsedTimeMs?: number;
  }
): Promise<ISyncHistory | null> {
  try {
    // First find the sync history to update the correct organization
    const syncHistory = await SyncHistory.findOne({ syncId });
    
    if (!syncHistory) {
      return null;
    }
    
    // Find the organization index
    const orgIndex = syncHistory.organizations.findIndex(org => org.login === orgLogin);
    
    if (orgIndex === -1) {
      return null;
    }
    
    // Create the update object with proper paths
    const updateObj: any = {};
    
    if (updates.totalMigrations !== undefined) {
      updateObj[`organizations.${orgIndex}.totalMigrations`] = updates.totalMigrations;
    }
    
    if (updates.totalPages !== undefined) {
      updateObj[`organizations.${orgIndex}.totalPages`] = updates.totalPages;
    }
    
    if (updates.latestMigrationDate !== undefined) {
      updateObj[`organizations.${orgIndex}.latestMigrationDate`] = updates.latestMigrationDate;
    }
    
    if (updates.error !== undefined) {
      // Add error to the array if not already present
      const currentErrors = syncHistory.organizations[orgIndex].errors || [];
      if (!currentErrors.includes(updates.error)) {
        updateObj[`organizations.${orgIndex}.errors`] = [...currentErrors, updates.error];
      }
    }
    
    if (updates.elapsedTimeMs !== undefined) {
      updateObj[`organizations.${orgIndex}.elapsedTimeMs`] = updates.elapsedTimeMs;
    }
    
    // Apply the updates
    const updatedSyncHistory = await SyncHistory.findOneAndUpdate(
      { syncId },
      { $set: updateObj },
      { new: true }
    );
    
    if (updatedSyncHistory) {
      // Publish update
      pubsub.publish(SYNC_HISTORY_UPDATED, {
        syncHistoryUpdated: updatedSyncHistory
      });
    }
    
    return updatedSyncHistory;
  } catch (error) {
    console.error('Error updating org sync history:', error);
    throw new Error('Failed to update org sync history');
  }
}

export async function completeSyncHistory(syncId: string, status: 'completed' | 'failed' = 'completed'): Promise<ISyncHistory | null> {
  try {
    const syncHistory = await SyncHistory.findOneAndUpdate(
      { syncId },
      {
        endTime: new Date(),
        status
      },
      { new: true }
    );
    
    if (syncHistory) {
      // Publish update
      pubsub.publish(SYNC_HISTORY_UPDATED, {
        syncHistoryUpdated: syncHistory
      });
    }
    
    return syncHistory;
  } catch (error) {
    console.error('Error completing sync history:', error);
    throw new Error('Failed to complete sync history');
  }
}
