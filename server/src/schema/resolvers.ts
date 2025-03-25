import axios from 'axios';
import { RepositoryMigration, MigrationState } from '../models/RepositoryMigration';
import moment from 'moment';
import { SortOrder } from 'mongoose';

interface Context {
  token: string;
}

export const resolvers = {
  Query: {
    // Get migrations by state from GitHub API directly
    repositoryMigrations: async (_: any, { state, before }: { state: MigrationState, before?: string }, context: Context) => {
      try {
        if (!context.token) {
          throw new Error('Authentication token is required');
        }

        // This would call the GitHub GraphQL API with the token from context
        // For now we'll return data from our database to demonstrate functionality
        const query = state ? { state } : {};
        const migrations = await RepositoryMigration.find(query).limit(100).sort({ createdAt: -1 });
        
        return {
          nodes: migrations.map(migration => ({
            id: migration.githubId,
            repositoryName: migration.repositoryName,
            createdAt: migration.createdAt.toISOString(),
            state: migration.state,
            failureReason: migration.failureReason,
            migrationLogUrl: migration.migrationLogUrl,
            completedAt: migration.completedAt?.toISOString(),
            duration: migration.duration ? `${Math.round(migration.duration / (1000 * 60))} minutes` : null,
            enterpriseName: migration.enterpriseName
          })),
          pageInfo: {
            hasPreviousPage: false, // For simplicity, we're not implementing pagination here
            startCursor: null,
            endCursor: null
          }
        };
      } catch (error) {
        console.error('Error in repositoryMigrations resolver:', error);
        throw error;
      }
    },

    // Get a single migration by ID from our database
    repositoryMigration: async (_: any, { id }: { id: string }) => {
      try {
        const migration = await RepositoryMigration.findOne({ githubId: id });
        
        if (!migration) {
          throw new Error(`Migration with ID ${id} not found`);
        }
        
        return {
          id: migration.githubId,
          repositoryName: migration.repositoryName,
          createdAt: migration.createdAt.toISOString(),
          state: migration.state,
          failureReason: migration.failureReason,
          migrationLogUrl: migration.migrationLogUrl,
          completedAt: migration.completedAt?.toISOString(),
          duration: migration.duration ? `${Math.round(migration.duration / (1000 * 60))} minutes` : null,
          enterpriseName: migration.enterpriseName
        };
      } catch (error) {
        console.error('Error in repositoryMigration resolver:', error);
        throw error;
      }
    },

    // Get all migrations from our database with filtering and sorting
    allMigrations: async (
      _: any, 
      { 
        state, 
        limit = 50, 
        offset = 0, 
        sortField = 'createdAt',
        sortOrder = 'desc' 
      }: {
        state?: MigrationState,
        limit?: number,
        offset?: number,
        sortField?: string,
        sortOrder?: string
      }
    ) => {
      try {
        const query = state ? { state } : {};
        // Fix the sort format for MongoDB
        const sort: Record<string, SortOrder> = { 
          [sortField]: (sortOrder === 'asc' ? 1 : -1) as SortOrder 
        };
        
        const migrations = await RepositoryMigration.find(query)
          .sort(sort)
          .skip(offset)
          .limit(limit);
        
        return migrations.map(migration => ({
          id: migration.githubId,
          repositoryName: migration.repositoryName,
          createdAt: migration.createdAt.toISOString(),
          state: migration.state,
          failureReason: migration.failureReason,
          migrationLogUrl: migration.migrationLogUrl,
          completedAt: migration.completedAt?.toISOString(),
          duration: migration.duration ? `${Math.round(migration.duration / (1000 * 60))} minutes` : null,
          enterpriseName: migration.enterpriseName
        }));
      } catch (error) {
        console.error('Error in allMigrations resolver:', error);
        throw error;
      }
    }
  },
  
  Mutation: {
    // Sync migrations from GitHub to our database
    syncMigrations: async (_: any, { enterpriseName, token }: { enterpriseName: string, token: string }) => {
      try {
        // Call our REST API endpoint to sync migrations
        const response = await axios.post(`http://localhost:4000/api/migrations/sync`, {
          enterpriseName,
          token
        });
        
        return true;
      } catch (error) {
        console.error('Error in syncMigrations resolver:', error);
        throw error;
      }
    },
    
    // Manually add a migration to our database
    addMigration: async (_: any, { 
      repositoryName, 
      state, 
      createdAt 
    }: { 
      repositoryName: string, 
      state: MigrationState, 
      createdAt: string 
    }) => {
      try {
        // Generate a fake GitHub ID for manually added migrations
        const githubId = `manual_${Date.now()}`;
        
        const migration = await RepositoryMigration.create({
          githubId,
          repositoryName,
          createdAt: new Date(createdAt),
          state,
          enterpriseName: 'manually-added' // Placeholder for manually added migrations
        });
        
        return {
          id: migration.githubId,
          repositoryName: migration.repositoryName,
          createdAt: migration.createdAt.toISOString(),
          state: migration.state,
          enterpriseName: migration.enterpriseName
        };
      } catch (error) {
        console.error('Error in addMigration resolver:', error);
        throw error;
      }
    },
    
    // Update a migration in our database
    updateMigration: async (_: any, { 
      id, 
      state, 
      completedAt,
      failureReason 
    }: { 
      id: string, 
      state?: MigrationState, 
      completedAt?: string,
      failureReason?: string 
    }) => {
      try {
        const migration = await RepositoryMigration.findOne({ githubId: id });
        
        if (!migration) {
          throw new Error(`Migration with ID ${id} not found`);
        }
        
        if (state) {
          migration.state = state;
        }
        
        if (completedAt) {
          migration.completedAt = new Date(completedAt);
        }
        
        if (failureReason) {
          migration.failureReason = failureReason;
        }
        
        await migration.save();
        
        return {
          id: migration.githubId,
          repositoryName: migration.repositoryName,
          createdAt: migration.createdAt.toISOString(),
          state: migration.state,
          failureReason: migration.failureReason,
          migrationLogUrl: migration.migrationLogUrl,
          completedAt: migration.completedAt?.toISOString(),
          duration: migration.duration ? `${Math.round(migration.duration / (1000 * 60))} minutes` : null,
          enterpriseName: migration.enterpriseName
        };
      } catch (error) {
        console.error('Error in updateMigration resolver:', error);
        throw error;
      }
    }
  }
};