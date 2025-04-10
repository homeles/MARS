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
        const results: { key: string, value: string }[] = [];
        
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
import { formatDate } from '../schema/dateFix';

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

  // Add resolvers for SyncHistory to handle date formatting
  SyncHistory: {
    startTime: (parent: any) => formatDate(parent.startTime),
    endTime: (parent: any) => formatDate(parent.endTime),
    createdAt: (parent: any) => formatDate(parent.createdAt || parent.startTime),
    updatedAt: (parent: any) => formatDate(parent.updatedAt || parent.endTime || parent.startTime),
  },

  // Add resolvers for OrgSyncHistory to format dates
  OrgSyncHistory: {
    latestMigrationDate: (parent: any) => formatDate(parent.latestMigrationDate)
  },
  
  Subscription: {
    syncHistoryUpdated: {
      subscribe: withFilter(
        // Make sure we return an async iterable by using a function that properly returns the pubsub.asyncIterator
        function() {
          // @ts-ignore - asyncIterator exists at runtime but TypeScript compiler doesn't recognize it
          return pubsub.asyncIterator([SYNC_HISTORY_UPDATED]);
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
    const now = new Date();
    const startTimeISO = now.toISOString(); // Create ISO string format for consistent storage

    console.log(`[DATE DEBUG] Creating sync history with startTime: ${startTimeISO}`);
    
    const syncHistory = new SyncHistory({
      enterpriseName,
      syncId,
      startTime: startTimeISO, // Explicitly set the start time
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
    
    // Log what was actually saved to the database
    console.log(`[DATE DEBUG] Saved sync history with ID: ${syncId}`);
    console.log(`[DATE DEBUG] Saved startTime in DB: ${syncHistory.startTime}`);
    console.log(`[DATE DEBUG] startTime type: ${typeof syncHistory.startTime}`);
    console.log(`[DATE DEBUG] Is startTime Date instance? ${syncHistory.startTime instanceof Date}`);
    console.log(`[DATE DEBUG] startTime toISOString: ${syncHistory.startTime instanceof Date ? syncHistory.startTime.toISOString() : 'Not a Date'}`);
    
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
    
    // Increment the completedOrganizations counter
    updateObj.completedOrganizations = syncHistory.completedOrganizations + 1;
    
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
    // First get the current sync history to calculate the duration
    const currentHistory = await SyncHistory.findOne({ syncId });
    if (!currentHistory) {
      console.log(`[DATE DEBUG] Cannot complete sync history - ID not found: ${syncId}`);
      return null;
    }
    
    console.log(`[DATE DEBUG] Completing sync with ID: ${syncId}`);
    console.log(`[DATE DEBUG] Current startTime in DB: ${currentHistory.startTime}`);
    console.log(`[DATE DEBUG] Current startTime type: ${typeof currentHistory.startTime}`);
    
    // Explicitly create a new Date object for both start and end times
    // This ensures we store valid JavaScript Date objects in ISO format
    const now = new Date();
    const startTime = currentHistory.startTime ? 
                      new Date(currentHistory.startTime) : 
                      new Date(now.getTime() - 60000); // Default 1 minute ago if no start time
                      
    // Create a valid end time as current time
    const endTime = now;
    
    // Log the date objects we've created
    console.log(`[DATE DEBUG] Processed startTime: ${startTime.toISOString()}`);
    console.log(`[DATE DEBUG] Created endTime: ${endTime.toISOString()}`);
    
    // Make sure all organizations are marked as completed
    const totalOrganizations = currentHistory.totalOrganizations || 0;
    
    // Calculate duration in milliseconds
    const durationMs = endTime.getTime() - startTime.getTime();
    console.log(`[DATE DEBUG] Calculated duration (ms): ${durationMs}`);
    
    // Create ISO strings for consistent storage
    const startTimeISO = startTime.toISOString();
    const endTimeISO = endTime.toISOString();
    
    console.log(`[DATE DEBUG] startTimeISO to save: ${startTimeISO}`);
    console.log(`[DATE DEBUG] endTimeISO to save: ${endTimeISO}`);
    
    // Force the dates to be stored as ISO strings for consistency
    const syncHistory = await SyncHistory.findOneAndUpdate(
      { syncId },
      {
        $set: {
          startTime: startTimeISO, // Store as ISO string for consistency
          endTime: endTimeISO,     // Store as ISO string for consistency
          status,
          completedOrganizations: totalOrganizations, // Ensure all orgs marked as completed
          durationMs: durationMs // Store duration for easier retrieval
        }
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
