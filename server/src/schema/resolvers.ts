import { withFilter } from 'graphql-subscriptions';
import mongoose from 'mongoose';
import axios from 'axios';
import { MigrationState, RepositoryMigration, OrgAccessStatus, IRepositoryMigration } from '../models/RepositoryMigration';
import { CronConfig } from '../models/CronConfig';
import { pubsub, SYNC_PROGRESS_UPDATED, SYNC_HISTORY_UPDATED } from '../index';
import { logger } from '../utils/logger';
import { UserPreference } from '../models/UserPreference';
import { SyncHistory } from '../models/SyncHistory';
import { 
  userPreferenceResolvers, 
  syncHistoryResolvers, 
  createSyncHistory, 
  updateSyncHistory, 
  updateOrgSyncHistory, 
  completeSyncHistory 
} from '../utils/resolverUtils';
import { stopCronJob, scheduleCronJob, calculateNextRun } from '../utils/cronManager';

// GraphQL pagination and order types
interface PageInfo {
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

interface MigrationOrder {
  field: 'CREATED_AT';
  direction: 'ASC' | 'DESC';
}

interface AllMigrationsArgs {
  state?: MigrationState;
  before?: string;
  after?: string;
  first?: number;
  last?: number;
  pageSize?: number;
  page?: number;
  orderBy?: MigrationOrder;
  enterpriseName?: string;
  organizationName?: string;
  search?: string;
}

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

interface Organization {
  id: string;
  login: string;
  name?: string;
}

interface GitHubPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
  hasPreviousPage: boolean;
  startCursor: string | null;
}

interface GitHubError {
  message: string;
}

interface GitHubApiResponse<T> {
  data: T;
  errors?: GitHubError[];
}

interface GitHubOrganizationData {
  enterprise: {
    organizations: {
      nodes: Array<Organization>;
      pageInfo: GitHubPageInfo;
    };
  };
}

interface GitHubMigrationData {
  organization: {
    repositoryMigrations: {
      nodes: Array<{
        id: string;
        databaseId: string;
        sourceUrl: string;
        state: string;
        warningsCount: number;
        failureReason?: string;
        createdAt: string;
        repositoryName: string;
        migrationSource?: {
          id: string;
          name: string;
          type: string;
          url: string;
        };
      }>;
      pageInfo: GitHubPageInfo;
    };
  };
}

type GitHubOrganizationResponse = GitHubApiResponse<GitHubOrganizationData>;
type GitHubMigrationResponse = GitHubApiResponse<GitHubMigrationData>;

interface ResolverContext {
  token: string;
}

interface Migration {
  state: string;
  id: string;
  databaseId: string;
  sourceUrl: string;
  warningsCount: number;
  failureReason?: string;
  createdAt: string;
  repositoryName: string;
  organizationName: string;
  targetOrganizationName?: string;
  migrationSource: {
    id: string;
    name: string;
    type: string;
    url: string;
  };
}

async function fetchAllOrganizations(enterpriseName: string, token: string) {
  const query = `
    query getOrganizations($enterprise: String!) {
      enterprise(slug: $enterprise) {
        organizations(first: 100) {
          nodes {
            id
            login
            name
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      GITHUB_GRAPHQL_URL,
      {
        query,
        variables: { enterprise: enterpriseName }
      },
      {
        headers: {
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    return response.data.data.enterprise.organizations.nodes;
  } catch (error) {
    console.error('Error fetching organizations:', error);
    throw error;
  }
}

interface OrgMigrationsResponse {
  data: {
    organization: {
      repositoryMigrations: {
        nodes: Array<{
          id: string;
          databaseId: string;
          sourceUrl: string;
          state: string;
          warningsCount: number;
          failureReason?: string;
          createdAt: string;
          repositoryName: string;
          migrationSource?: {
            id: string;
            name: string;
            type: string;
            url: string;
          };
        }>;
        pageInfo: {
          hasPreviousPage: boolean;
          startCursor: string | null;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

async function fetchOrganizationMigrations(orgLogin: string, token: string): Promise<{ migrations: any[]; totalPages: number }> {
  let hasNextPage = true;
  let cursor: string | null = null;
  let currentPage = 1;
  const allMigrations: any[] = [];

  while (hasNextPage) {
    try {
      const query = `
        query getOrgMigrations($org: String!, $before: String) {
          organization(login: $org) {
            repositoryMigrations(
              last: 100,
              before: $before,
              orderBy: {field: CREATED_AT, direction: DESC}
            ) {
              nodes {
                id
                databaseId
                sourceUrl
                state
                warningsCount
                failureReason
                createdAt
                repositoryName
                migrationSource {
                  id
                  name
                  type
                  url
                }
              }
              pageInfo {
                hasPreviousPage
                startCursor
              }
            }
          }
        }
      `;

      console.log(`[Sync] Fetching page ${currentPage} for organization ${orgLogin}`);
      
      const response: { data: OrgMigrationsResponse } = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query,
          variables: { org: orgLogin, before: cursor }
        },
        {
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (response.data?.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(response.data.errors)}`);
      }

      const migrations = response.data.data.organization.repositoryMigrations;
      if (!migrations) {
        throw new Error(`No repository migrations data found for organization ${orgLogin}`);
      }

      allMigrations.push(...migrations.nodes);
      hasNextPage = migrations.pageInfo.hasPreviousPage;
      cursor = migrations.pageInfo.startCursor;
      currentPage++;

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error fetching migrations:', error);
      throw error;
    }
  }

  return { migrations: allMigrations, totalPages: currentPage - 1 };
}

async function processMigration(migration: any, enterpriseName: string, orgLogin: string) {
  try {
    const createdAtDate = new Date(migration.createdAt);
    if (isNaN(createdAtDate.getTime())) {
      console.error('Invalid createdAt date:', {
        migrationId: migration.id,
        createdAt: migration.createdAt
      });
      throw new Error(`Invalid createdAt date: ${migration.createdAt}`);
    }

    // Find existing migration
    const existingMigration = await RepositoryMigration.findOne({ githubId: migration.id });
    if (existingMigration) {
      // If it exists, only update if the state has changed
      if (existingMigration.state !== migration.state) {
        existingMigration.state = migration.state;
        existingMigration.warningsCount = migration.warningsCount;
        existingMigration.failureReason = migration.failureReason;
        existingMigration.migrationSource = migration.migrationSource;
        await existingMigration.save();
      }
    } else {
      // Create new migration with original GitHub timestamp
      await RepositoryMigration.create({
        githubId: migration.id,
        databaseId: migration.databaseId,
        sourceUrl: migration.sourceUrl,
        state: migration.state,
        warningsCount: migration.warningsCount,
        failureReason: migration.failureReason,
        createdAt: createdAtDate,
        repositoryName: migration.repositoryName,
        enterpriseName: enterpriseName,
        organizationName: orgLogin,
        migrationSource: migration.migrationSource
      });
    }
  } catch (error) {
    console.error('Error processing migration:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      migrationId: migration.id,
      createdAt: migration.createdAt
    });
    throw error;
  }
}

async function fetchMigrationsPage(orgLogin: string, token: string, cursor: string | null) {
  const query = `
    query getOrgMigrations($org: String!, $before: String) {
      organization(login: $org) {
        repositoryMigrations(
          last: 100,
          before: $before,
          orderBy: {field: CREATED_AT, direction: DESC}
        ) {
          nodes {
            id
            databaseId
            sourceUrl
            state
            warningsCount
            failureReason
            createdAt
            repositoryName
            migrationSource {
              id
              name
              type
              url
            }
          }
          pageInfo {
            hasPreviousPage
            startCursor
          }
          totalCount
        }
      }
    }
  `;

  const response = await axios.post(
    GITHUB_GRAPHQL_URL,
    {
      query,
      variables: { org: orgLogin, before: cursor }
    },
    {
      headers: {
        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    }
  );

  if (response.data?.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(response.data.errors)}`);
  }

  const migrations = response.data.data.organization.repositoryMigrations;
  return {
    migrations: migrations.nodes,
    hasNextPage: migrations.pageInfo.hasPreviousPage,
    cursor: migrations.pageInfo.startCursor,
    totalCount: migrations.totalCount
  };
}

export const resolvers = {
  Query: {
    allMigrations: async (_: unknown, { 
      state, 
      pageSize = 10,
      page = 1,
      orderBy,
      enterpriseName,
      organizationName,
      search 
    }: AllMigrationsArgs) => {
      try {
        // Base query conditions
        let query: any = {};
        
        if (state) {
          query.state = state;
        }
        if (enterpriseName) {
          query.enterpriseName = enterpriseName;
        }
        if (organizationName) {
          query.organizationName = organizationName;
        }
        
        // Add text search if search parameter is provided
        if (search) {
          query.$or = [
            { repositoryName: { $regex: search, $options: 'i' } },
            { organizationName: { $regex: search, $options: 'i' } },
            { state: { $regex: search, $options: 'i' } },
            { failureReason: { $regex: search, $options: 'i' } }
          ];
        }

        // Sort configuration
        const sortDirection = orderBy?.direction === 'DESC' ? -1 : 1;
        let sortField = 'createdAt';
        
        // Map GraphQL enum fields to MongoDB field names
        switch (orderBy?.field?.toLowerCase()) {
          case 'repository_name':
            sortField = 'repositoryName';
            break;
          case 'organization_name':
            sortField = 'organizationName';
            break;
          case 'state':
            sortField = 'state';
            break;
          case 'warnings_count':
            sortField = 'warningsCount';
            break;
          case 'duration':
            sortField = 'duration';
            break;
          case 'created_at':
          default:
            sortField = 'createdAt';
        }
        
        // Get total count for pagination info
        const totalCount = await RepositoryMigration.countDocuments(query);
        
        // Calculate pagination
        const limit = Math.max(1, Math.min(100, pageSize)); // Ensure pageSize is between 1 and 100
        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = Math.max(1, Math.min(page, totalPages)); // Ensure page is valid
        const skip = (currentPage - 1) * limit;

        // Execute query with pagination and case-insensitive sorting
        const migrations = await RepositoryMigration.find(query)
          .collation({ locale: 'en', strength: 2 }) // strength: 2 means case-insensitive
          .sort({ [sortField]: sortDirection })
          .skip(skip)
          .limit(limit)
          .exec();

        // Calculate pagination metadata
        const hasNextPage = currentPage < totalPages;
        const hasPreviousPage = currentPage > 1;

        // Get metrics for all states
        const metrics = {
          totalCount,
          completedCount: await RepositoryMigration.countDocuments({ ...query, state: 'SUCCEEDED' }),
          failedCount: await RepositoryMigration.countDocuments({ ...query, state: { $in: ['FAILED', 'FAILED_VALIDATION'] } }),
          inProgressCount: await RepositoryMigration.countDocuments({ ...query, state: 'IN_PROGRESS' })
        };

        return {
          nodes: migrations.map(migration => ({
            ...migration.toObject(),
            id: migration._id.toString(),
            createdAt: migration.createdAt instanceof Date ? migration.createdAt.toISOString() : null
          })),
          pageInfo: {
            hasPreviousPage,
            hasNextPage,
            totalPages,
            currentPage
          },
          ...metrics
        };
      } catch (error) {
        console.error('[ERROR] Error in allMigrations resolver:', error);
        throw error;
      }
    },

    migration: async (_: unknown, { id }: { id: string }, { token }: ResolverContext) => {
      if (!token) {
        throw new Error('Authentication token is required');
      }

      // First try to find by MongoDB _id
      let localMigration = await RepositoryMigration.findById(id) as IRepositoryMigration | null;
      
      // If not found by _id, try finding by githubId
      if (!localMigration) {
        localMigration = await RepositoryMigration.findOne({ githubId: id }) as IRepositoryMigration | null;
      }

      if (localMigration) {
        const migration = localMigration.toObject();
        return {
          ...migration,
          id: migration._id.toString(), // Explicitly map _id to id
          createdAt: migration.createdAt instanceof Date ? migration.createdAt.toISOString() : null
        };
      }

      // If not found locally, try to fetch from GitHub
      const query = `
        query getMigration($id: ID!) {
          node(id: $id) {
            ... on RepositoryMigration {
              id
              databaseId
              sourceUrl
              state
              warningsCount
              failureReason
              createdAt
              repositoryName
              migrationSource {
                id
                name
                type
                url
              }
            }
          }
        }
      `;

      try {
        const response = await axios.post(
          GITHUB_GRAPHQL_URL,
          {
            query,
            variables: { id }
          },
          {
            headers: {
              'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          }
        );

        if (response.data.errors) {
          throw new Error(response.data.errors[0].message);
        }

        return response.data.data.node;
      } catch (error) {
        console.error('Error fetching migration:', error);
        throw error;
      }
    },

    enterpriseStats: async (
      _: unknown,
      { enterpriseName }: { enterpriseName: string },
      { token }: ResolverContext
    ) => {
      if (!token) {
        throw new Error('Authentication token is required');
      }

      // First get organizations
      const orgs = await fetchAllOrganizations(enterpriseName, token);
      let allMigrations: any[] = [];

      // Get migrations for each organization
      for (const org of orgs) {
        try {
          const { migrations } = await fetchOrganizationMigrations(org.login, token);
          allMigrations = [...allMigrations, ...migrations];
        } catch (error) {
          console.error(`Error fetching migrations for org ${org.login}:`, error);
          continue;
        }
      }

      const totalMigrations = allMigrations.length;
      const completedMigrations = allMigrations.filter((m: Migration) => m.state === 'SUCCEEDED').length;
      const failedMigrations = allMigrations.filter((m: Migration) => m.state === 'FAILED').length;
      const inProgressMigrations = allMigrations.filter((m: Migration) => m.state === 'IN_PROGRESS').length;

      return {
        totalMigrations,
        completedMigrations,
        failedMigrations,
        inProgressMigrations,
        averageDuration: null // We can't calculate this without completedAt
      };
    },

    enterprise: async (_: unknown, { slug }: { slug: string }, { token }: ResolverContext) => {
      if (!token) {
        throw new Error('Authentication token is required');
      }

      const query = `
        query getEnterpriseOrgs($slug: String!) {
          enterprise(slug: $slug) {
            organizations(first: 100) {
              nodes {
                id
                login
                name
              }
            }
          }
        }
      `;

      try {
        const response = await axios.post(
          GITHUB_GRAPHQL_URL,
          {
            query,
            variables: { slug }
          },
          {
            headers: {
              'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          }
        );

        if (response.data.errors) {
          throw new Error(response.data.errors[0].message);
        }

        return response.data.data.enterprise;
      } catch (error) {
        console.error('Error fetching enterprise organizations:', error);
        throw error;
      }
    },

    orgAccessStatus: async (_: unknown, { enterpriseName }: { enterpriseName: string }) => {
      return await OrgAccessStatus.find({ enterpriseName });
    },

    cronConfig: async (_: unknown, { enterpriseName }: { enterpriseName: string }) => {
      try {
        return await CronConfig.findOne({ enterpriseName });
      } catch (error) {
        console.error('Error fetching cron config:', error);
        throw new Error('Failed to fetch cron configuration');
      }
    }
  },

  Mutation: {
    syncMigrations: async (_: any, { enterpriseName, token, selectedOrganizations }: { enterpriseName: string, token: string, selectedOrganizations?: string[] }) => {
      try {
        console.log(`[Sync] Starting migration sync for enterprise: ${enterpriseName}`);
        
        // Fetch organizations
        console.log(`[Sync] Fetching organizations for enterprise ${enterpriseName}`);
        let organizations = await fetchAllOrganizations(enterpriseName, token);
        
        // Filter organizations if specific ones are selected
        if (selectedOrganizations && selectedOrganizations.length > 0) {
          organizations = organizations.filter((org: { login: string }) => selectedOrganizations.includes(org.login));
          console.log(`[Sync] Filtered to ${organizations.length} selected organizations`);
        }
        
        console.log(`[Sync] Found ${organizations.length} organizations to process`);

        // Define a more comprehensive interface for progress tracking
        interface SyncProgressItem {
          organizationName: string;
          totalPages: number;
          currentPage: number;
          migrationsCount: number;
          isCompleted: boolean;
          error?: string;
          estimatedTimeRemainingMs?: number;
          elapsedTimeMs?: number;
          processingRate?: number;
        }

        const progress: SyncProgressItem[] = [];

        // Initialize progress for all organizations
        organizations.forEach((org: { login: string }) => {
          progress.push({
            organizationName: org.login,
            totalPages: 0,
            currentPage: 0,
            migrationsCount: 0,
            isCompleted: false
          });
        });

        // Initial progress update
        pubsub.publish(SYNC_PROGRESS_UPDATED, { 
          syncProgressUpdated: progress,
          enterpriseName 
        });

        // Generate a unique syncId for this sync operation
        const syncId = `sync-${Date.now()}`;
        logger.info('SyncMigrations', `Starting sync with ID: ${syncId}`, { 
          enterpriseName, 
          organizationsCount: organizations.length,
          selectedOrgs: organizations.map((o: { login: string }) => o.login)
        }, syncId);
        
        // Create a sync history record in the database
        const orgLogins = organizations.map((org: { login: string }) => org.login);
        await createSyncHistory(enterpriseName, syncId, orgLogins);
        
        // Process each organization
        for (const org of organizations) {
          const orgIndex = progress.findIndex(p => p.organizationName === org.login);
          
          // Start tracking sync for this organization
          logger.syncStart('SyncMigrations', org.login, syncId);
          
          try {
            let hasNextPage = true;
            let cursor: string | null = null;
            let currentPage = 1;
            let totalMigrations = 0;
            let estimatedTotalPages = 0;

            // Make an initial request to get total count estimate
            const initialResult = await fetchMigrationsPage(org.login, token, null);
            if (initialResult.totalCount) {
              estimatedTotalPages = Math.ceil(initialResult.totalCount / 100);
              progress[orgIndex].totalPages = estimatedTotalPages;
              
              logger.info('SyncMigrations', `Initial estimate for ${org.login}`, {
                organization: org.login,
                estimatedTotalMigrations: initialResult.totalCount,
                estimatedTotalPages
              }, syncId);
            }
            
            // Process the initial results
            totalMigrations = initialResult.migrations.length;
            progress[orgIndex].migrationsCount = totalMigrations;
            progress[orgIndex].currentPage = currentPage;
            
            // Publish progress update immediately after getting the first data
            pubsub.publish(SYNC_PROGRESS_UPDATED, { 
              syncProgressUpdated: progress,
              enterpriseName 
            });
            
            // Process migrations from initial request
            if (initialResult.migrations.length > 0) {
              for (const migration of initialResult.migrations) {
                await processMigration(migration, enterpriseName, org.login);
              }
            }
            
            // Update pagination info from initial request
            hasNextPage = initialResult.hasNextPage;
            cursor = initialResult.cursor;
            currentPage++;

            // Publish initial progress
            const progressDetails = logger.progress(
              'SyncMigrations', 
              org.login, 
              currentPage - 1,
              estimatedTotalPages, 
              totalMigrations,
              syncId
            );
            
            // Include estimated time info in progress updates
            progress[orgIndex].estimatedTimeRemainingMs = progressDetails.estimatedTimeRemainingMs;
            progress[orgIndex].elapsedTimeMs = progressDetails.elapsedTimeMs;
            progress[orgIndex].processingRate = progressDetails.processingRate;
            
            pubsub.publish(SYNC_PROGRESS_UPDATED, { 
              syncProgressUpdated: progress,
              enterpriseName 
            });

            // Process remaining pages
            while (hasNextPage) {
              // Update progress before each page fetch
              progress[orgIndex].currentPage = currentPage;
              pubsub.publish(SYNC_PROGRESS_UPDATED, { 
                syncProgressUpdated: progress,
                enterpriseName 
              });

              // Log GraphQL request
              logger.graphql('SyncMigrations', org.login, currentPage, hasNextPage, syncId);
              
              // Initial update indicating data fetching has started for this page
              const currentTime = Date.now();
              const startTime = Date.now() - 5000; // Estimate a reasonable start time
              progress[orgIndex].elapsedTimeMs = currentTime - startTime;
              pubsub.publish(SYNC_PROGRESS_UPDATED, { 
                syncProgressUpdated: progress,
                enterpriseName 
              });
              
              // Fetch the data for this page
              let result: { 
                migrations: any[]; 
                hasNextPage: boolean; 
                cursor: string | null;
                totalCount?: number;
              };
              
              try {
                result = await fetchMigrationsPage(org.login, token, cursor);
              } catch (pageError) {
                // Check if this is the missing migration source error
                const errorMsg = pageError instanceof Error ? pageError.message : 'Unknown error';
                if (errorMsg.includes('Migration source not found with ID')) {
                  logger.info('SyncMigrations', `Missing migration source detected, skipping to next page`, {
                    organization: org.login,
                    error: errorMsg,
                    currentPage,
                    syncId
                  });
                  // End pagination as we can't reliably continue with the cursor
                  hasNextPage = false;
                  break;
                } else {
                  // For other errors, rethrow
                  throw pageError;
                }
              }
              
              // Quick update right after data is received, before processing starts
              if (result && result.migrations && result.migrations.length > 0) {
                // Update counters but don't process yet
                totalMigrations += result.migrations.length;
                progress[orgIndex].migrationsCount = totalMigrations;
                progress[orgIndex].totalPages = Math.max(progress[orgIndex].totalPages, estimatedTotalPages);
                
                // Send an immediate progress update to show we've fetched new data
                pubsub.publish(SYNC_PROGRESS_UPDATED, { 
                  syncProgressUpdated: progress,
                  enterpriseName 
                });
                
                // Begin processing the migrations
                let processedCount = 0;
                const batchSize = 10; // Process in smaller batches
                
                // Process migrations in batches without creating complex arrays
                for (let i = 0; i < result.migrations.length; i += batchSize) {
                  const end = Math.min(i + batchSize, result.migrations.length);
                  
                  // Process this batch
                  for (let j = i; j < end; j++) {
                    const migration = result.migrations[j];
                    await processMigration(migration, enterpriseName, org.login);
                    processedCount++;
                  }
                  
                  // Update UI after each batch
                  const progressDetails = logger.progress(
                    'SyncMigrations', 
                    org.login, 
                    currentPage - 1,
                    estimatedTotalPages || currentPage, 
                    totalMigrations,
                    syncId
                  );
                  
                  // Include estimated time info in progress updates
                  progress[orgIndex].estimatedTimeRemainingMs = progressDetails.estimatedTimeRemainingMs;
                  progress[orgIndex].elapsedTimeMs = progressDetails.elapsedTimeMs;
                  progress[orgIndex].processingRate = progressDetails.processingRate;
                  
                  // Send batch progress update
                  pubsub.publish(SYNC_PROGRESS_UPDATED, { 
                    syncProgressUpdated: progress,
                    enterpriseName 
                  });
                }
                
                // Update pagination info
                hasNextPage = result.hasNextPage;
                cursor = result.cursor;
                currentPage++;
                
                // Update progress with new metrics
                progress[orgIndex].totalPages = Math.max(progress[orgIndex].totalPages, estimatedTotalPages);
                
                // Get final page progress metrics with timing info
                const finalProgressDetails = logger.progress(
                  'SyncMigrations', 
                  org.login, 
                  currentPage - 1,
                  estimatedTotalPages || currentPage, 
                  totalMigrations,
                  syncId
                );
                
                // Include estimated time info in progress updates
                progress[orgIndex].estimatedTimeRemainingMs = finalProgressDetails.estimatedTimeRemainingMs;
                progress[orgIndex].elapsedTimeMs = finalProgressDetails.elapsedTimeMs;
                progress[orgIndex].processingRate = finalProgressDetails.processingRate;
                
                // Send updated progress to clients
                pubsub.publish(SYNC_PROGRESS_UPDATED, { 
                  syncProgressUpdated: progress,
                  enterpriseName 
                });

                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                hasNextPage = false;
              }
            }
            
            // Mark as completed and log completion
            progress[orgIndex].isCompleted = true;
            logger.syncComplete('SyncMigrations', org.login, totalMigrations, syncId);
            
            // Update the sync history record for this organization
            await updateOrgSyncHistory(syncId, org.login, {
              totalMigrations: totalMigrations,
              totalPages: currentPage - 1,
              latestMigrationDate: new Date(),
              elapsedTimeMs: progress[orgIndex].elapsedTimeMs || 0
            });
            
            pubsub.publish(SYNC_PROGRESS_UPDATED, { 
              syncProgressUpdated: progress,
              enterpriseName 
            });
          } catch (orgError) {
            // Handle errors
            logger.error('SyncMigrations', `Error syncing organization ${org.login}`, {
              organization: org.login,
              error: orgError instanceof Error ? orgError.message : 'Unknown error',
              stack: orgError instanceof Error ? orgError.stack : undefined
            }, syncId);
            
            progress[orgIndex].error = orgError instanceof Error ? orgError.message : 'Unknown error';
            progress[orgIndex].isCompleted = true;
            pubsub.publish(SYNC_PROGRESS_UPDATED, { 
              syncProgressUpdated: progress,
              enterpriseName 
            });
          }
        }

        console.log(`[Sync] Completed full sync for enterprise: ${enterpriseName}`);
        
        // Mark the sync history as completed
        await completeSyncHistory(syncId, 'completed');
        
        return { 
          success: true, 
          message: 'Sync completed successfully',
          progress 
        };
      } catch (error) {
        console.error(`[Sync] Error during sync process:`, error);
        return { 
          success: false, 
          message: error instanceof Error ? error.message : 'An unknown error occurred',
          progress: [] 
        };
      }
    },

    checkOrgAccess: async (_: unknown, { enterpriseName, token }: { enterpriseName: string; token: string }) => {
      // Clear existing access statuses for this enterprise
      await OrgAccessStatus.deleteMany({ enterpriseName });

      // Get organizations for the enterprise
      const query = `
        query getOrganizations($enterprise: String!) {
          enterprise(slug: $enterprise) {
            organizations(first: 100) {
              nodes {
                id
                login
                name
              }
            }
          }
        }
      `;

      const orgsResponse = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query,
          variables: { enterprise: enterpriseName }
        },
        {
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (orgsResponse.data.errors) {
        throw new Error(orgsResponse.data.errors[0].message);
      }

      const orgs = orgsResponse.data.data.enterprise.organizations.nodes;
      // Use any[] to avoid TypeScript errors when pushing MongoDB document objects
      const results: any[] = [];

      // Check access for each organization
      for (const org of orgs as Organization[]) {
        try {
          const checkQuery = `
            query checkAccess($org: String!) {
              organization(login: $org) {
                viewerCanAdminister
              }
            }
          `;

          const result = await axios.post(
            GITHUB_GRAPHQL_URL,
            {
              query: checkQuery,
              variables: { org: org.login }
            },
            {
              headers: {
                'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
                'Content-Type': 'application/json',
              }
            }
          );

          const hasAccess = !result.data.errors && result.data.data.organization?.viewerCanAdminister;
          const errorMessage = result.data.errors ? result.data.errors[0].message : null;

          // Save to database
          const accessStatus = await OrgAccessStatus.create({
            orgId: org.id,
            orgLogin: org.login,
            hasAccess,
            errorMessage,
            lastChecked: new Date(),
            enterpriseName
          });

          results.push(accessStatus);
        } catch (error) {
          // Save error state to database
          const accessStatus = await OrgAccessStatus.create({
            orgId: org.id,
            orgLogin: org.login,
            hasAccess: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            lastChecked: new Date(),
            enterpriseName
          });

          results.push(accessStatus);
        }
      }

      return results;
    },

    updateCronConfig: async (_: unknown, { 
      enterpriseName, 
      schedule, 
      enabled 
    }: { 
      enterpriseName: string; 
      schedule: string; 
      enabled: boolean; 
    }) => {
      try {
        logger.info('CronManager', `Updating cron config for ${enterpriseName}`, { schedule, enabled });

        // Stop existing cron job if any
        if (!enabled) {
          stopCronJob(enterpriseName);
        }

        // Save or update cron configuration
        const config = await CronConfig.findOneAndUpdate(
          { enterpriseName },
          { 
            schedule, 
            enabled,
            nextRun: enabled ? calculateNextRun(schedule) : null
          },
          { 
            upsert: true, 
            new: true,
            runValidators: true
          }
        );

        // Schedule new job if enabled
        if (enabled) {
          await scheduleCronJob(enterpriseName, schedule);
        }

        return config;
      } catch (error) {
        logger.error('CronManager', `Error updating cron config for ${enterpriseName}`, { error });
        throw new Error('Failed to update cron configuration');
      }
    },
  },

  Subscription: {
    syncProgressUpdated: {
      subscribe: withFilter(
        // Explicitly return the asyncIterator with a proper function declaration
        function syncProgressIterator() {
          // Using ts-ignore directive to suppress the TypeScript error
          // @ts-ignore - asyncIterator exists at runtime but TypeScript doesn't know about it
          const iterator = pubsub.asyncIterator([SYNC_PROGRESS_UPDATED]);
          return iterator; // Ensure we're returning the iterator directly
        },
        function(payload: any, args: { enterpriseName: string } | undefined): boolean {
          if (!payload || !args) return false;
          console.log('Subscription filter:', payload.enterpriseName, args.enterpriseName);
          return payload.enterpriseName === args.enterpriseName;
        }
      ),
    },
  },
};

export interface SyncProgressPayload {
  syncProgressUpdated: Array<{
    organizationName: string;
    totalPages: number;
    currentPage: number;
    migrationsCount: number;
    isCompleted: boolean;
    error?: string;
    estimatedTimeRemainingMs?: number;
    elapsedTimeMs?: number;
    processingRate?: number;
  }>;
  enterpriseName: string;
}