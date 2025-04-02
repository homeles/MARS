import mongoose from 'mongoose';
import axios from 'axios';
import { MigrationState, RepositoryMigration, OrgAccessStatus, IRepositoryMigration } from '../models/RepositoryMigration';

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

async function fetchOrganizationMigrations(orgLogin: string, token: string) {
  let hasNextPage = true;
  let after: string | null = null;
  const allMigrations: any[] = [];

  while (hasNextPage) {
    try {
      const query = `
        query getOrgMigrations($org: String!, $after: String) {
          organization(login: $org) {
            repositoryMigrations(last: 100, after: $after) {
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

      interface OrgMigrationsResponse {
        data: {
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
        };
      }

      const response: OrgMigrationsResponse = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query,
          variables: { org: orgLogin, after }
        },
        {
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (response.data?.errors) {
        throw new Error(response.data.errors[0].message);
      }

      if (!response.data?.data?.organization) {
        throw new Error(`Unable to fetch data for organization ${orgLogin}`);
      }

      const migrations = response.data.data.organization.repositoryMigrations;
      if (!migrations) {
        throw new Error(`No repository migrations data found for organization ${orgLogin}`);
      }

      allMigrations.push(...migrations.nodes);
      
      hasNextPage = migrations.pageInfo.hasPreviousPage;
      after = migrations.pageInfo.startCursor;
      
      console.log(`[Sync] Fetched ${migrations.nodes.length} migrations for ${orgLogin}, hasPreviousPage: ${hasNextPage}`);
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error fetching migrations:', error);
      throw error;
    }
  }

  return allMigrations;
}

async function processMigration(migration: any, enterpriseName: string, orgLogin: string) {
  try {
    await RepositoryMigration.findOneAndUpdate(
      { githubId: migration.id },
      {
        githubId: migration.id,
        databaseId: migration.databaseId,
        sourceUrl: migration.sourceUrl,
        state: migration.state,
        warningsCount: migration.warningsCount,
        failureReason: migration.failureReason,
        createdAt: new Date(migration.createdAt),
        repositoryName: migration.repositoryName,
        enterpriseName: enterpriseName,
        organizationName: orgLogin,
        migrationSource: migration.migrationSource
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('Error processing migration:', error);
    throw error;
  }
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
        console.log('[Query] allMigrations called with params:', {
          state,
          pageSize,
          page,
          orderBy,
          enterpriseName,
          organizationName,
          search
        });
        
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
        const sortField = orderBy?.field?.toLowerCase() || 'createdAt';
        
        // Get total count for pagination info
        const totalCount = await RepositoryMigration.countDocuments(query);
        
        // Calculate pagination
        const limit = Math.max(1, Math.min(100, pageSize)); // Ensure pageSize is between 1 and 100
        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = Math.max(1, Math.min(page, totalPages)); // Ensure page is valid
        const skip = (currentPage - 1) * limit;

        console.log('[Query] Executing MongoDB query:', {
          query,
          sort: { [sortField]: sortDirection },
          skip,
          limit,
          currentPage,
          totalPages
        });

        // Execute query with pagination
        const migrations = await RepositoryMigration.find(query)
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

        console.log('[Query] Response metrics:', { 
          resultCount: migrations.length,
          currentPage,
          totalPages,
          hasNextPage,
          hasPreviousPage,
          ...metrics
        });

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

      const query = `
        query getEnterpriseStats($enterpriseName: String!) {
          enterprise(slug: $enterpriseName) {
            repositoryMigrations: organizations(first: 100) {
              nodes {
                repositoryMigrations(first: 100) {
                  nodes {
                    id
                    state
                    createdAt
                  }
                }
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
            variables: { enterpriseName }
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

        const organizations = response.data.data.enterprise.repositoryMigrations.nodes;
        let allMigrations: any[] = [];

        // Collect migrations from all organizations' repositoryMigrations
        organizations.forEach((org: any) => {
          const orgMigrations = org.repositoryMigrations.nodes;
          allMigrations = [...allMigrations, ...orgMigrations];
        });

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
      } catch (error) {
        console.error('Error fetching enterprise stats:', error);
        throw error;
      }
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

        // Process each organization
        for (const org of organizations) {
          console.log(`[Sync] Processing organization: ${org.login}`);
          try {
            const migrations = await fetchOrganizationMigrations(org.login, token);
            console.log(`[Sync] Processing ${migrations.length} migrations for ${org.login}`);

            // Process migrations for this org
            for (const migration of migrations) {
              try {
                await processMigration(migration, enterpriseName, org.login);
              } catch (migrationError) {
                console.error(`[Sync] Error processing migration ${migration.id} for ${org.login}:`, migrationError);
              }
            }
            
            console.log(`[Sync] Completed processing organization: ${org.login}`);
          } catch (orgError) {
            console.error(`[Sync] Error processing organization ${org.login}:`, orgError);
          }
        }

        console.log(`[Sync] Completed full sync for enterprise: ${enterpriseName}`);
        return { success: true, message: 'Sync completed successfully' };
      } catch (error) {
        console.error(`[Sync] Error during sync process:`, error);
        return { 
          success: false, 
          message: error instanceof Error ? error.message : 'An unknown error occurred' 
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
      const results = [];

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
    }
  }
};