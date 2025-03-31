import axios from 'axios';
import { MigrationState, RepositoryMigration, OrgAccessStatus, IRepositoryMigration } from '../models/RepositoryMigration';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

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
      nodes: Array<{
        id: string;
        login: string;
        name: string;
      }>;
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
        completedAt?: string;
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
  downloadUrl: string;
  excludeAttachments: boolean;
  excludeGitData: boolean;
  excludeOwnerProjects: boolean;
  excludeReleases: boolean;
  locked: boolean;
  sourceUrl: string;
  warningsCount: number;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
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
  const query = `
    query getOrgMigrations($org: String!) {
      organization(login: $org) {
        repositoryMigrations(first: 100) {
          nodes {
            id
            databaseId
            downloadUrl
            excludeAttachments
            excludeGitData
            excludeOwnerProjects
            excludeReleases
            locked
            sourceUrl
            state
            warningsCount
            failureReason
            createdAt
            completedAt
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
    }
  `;

  try {
    const response = await axios.post(
      GITHUB_GRAPHQL_URL,
      {
        query,
        variables: { org: orgLogin }
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

    return response.data.data.organization.repositoryMigrations.nodes;
  } catch (error) {
    console.error('Error fetching migrations:', error);
    throw error;
  }
}

async function processMigration(migration: any, enterpriseName: string, orgLogin: string) {
  try {
    await RepositoryMigration.findOneAndUpdate(
      { githubId: migration.id },
      {
        githubId: migration.id,
        databaseId: migration.databaseId,
        downloadUrl: migration.downloadUrl,
        excludeAttachments: migration.excludeAttachments,
        excludeGitData: migration.excludeGitData,
        excludeOwnerProjects: migration.excludeOwnerProjects,
        excludeReleases: migration.excludeReleases,
        locked: migration.locked,
        sourceUrl: migration.sourceUrl,
        state: migration.state,
        warningsCount: migration.warningsCount,
        failureReason: migration.failureReason,
        createdAt: new Date(migration.createdAt),
        completedAt: migration.completedAt ? new Date(migration.completedAt) : undefined,
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
    allMigrations: async (
      _: unknown,
      { state, first = 100, after, enterpriseName, organizationName }: { 
        state?: string;
        first?: number;
        after?: string;
        enterpriseName?: string;
        organizationName?: string;
      },
      { token }: ResolverContext
    ) => {
      if (!token) {
        throw new Error('Authentication token is required');
      }

      // First get the migrations from the database
      let migrations = await RepositoryMigration.find()
        .sort({ createdAt: -1 })
        .lean();

      // Filter by state if specified
      if (state) {
        migrations = migrations.filter(m => m.state === state);
      }

      // Filter by organization if specified
      if (organizationName) {
        migrations = migrations.filter(m => m.organizationName === organizationName);
      }

      // Map MongoDB fields to GraphQL fields and validate required fields
      const nodes = migrations
        .filter(m => {
          // Filter out any documents that are missing required fields
          return m._id && 
                 m.githubId && 
                 m.state && 
                 m.repositoryName && 
                 m.organizationName && 
                 m.createdAt;
        })
        .map(m => ({
          id: m._id.toString(),
          githubId: m.githubId,
          databaseId: m.databaseId || null,
          downloadUrl: m.downloadUrl || null,
          excludeAttachments: m.excludeAttachments || false,
          excludeGitData: m.excludeGitData || false,
          excludeOwnerProjects: m.excludeOwnerProjects || false,
          excludeReleases: m.excludeReleases || false,
          locked: m.locked || false,
          sourceUrl: m.sourceUrl || null,
          state: m.state,
          warningsCount: m.warningsCount || 0,
          failureReason: m.failureReason || null,
          createdAt: m.createdAt.toISOString(),
          completedAt: m.completedAt?.toISOString() || null,
          repositoryName: m.repositoryName,
          enterpriseName: m.enterpriseName,
          organizationName: m.organizationName,
          targetOrganizationName: m.targetOrganizationName || null,
          migrationSource: m.migrationSource || null
        }));

      return {
        nodes,
        pageInfo: {
          hasNextPage: false,
          endCursor: null
        },
        totalCount: nodes.length
      };
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
        return {
          id: localMigration._id.toString(),
          githubId: localMigration.githubId,
          databaseId: localMigration.databaseId,
          downloadUrl: localMigration.downloadUrl,
          excludeAttachments: localMigration.excludeAttachments || false,
          excludeGitData: localMigration.excludeGitData || false,
          excludeOwnerProjects: localMigration.excludeOwnerProjects || false,
          excludeReleases: localMigration.excludeReleases || false,
          locked: localMigration.locked || false,
          sourceUrl: localMigration.sourceUrl,
          state: localMigration.state,
          warningsCount: localMigration.warningsCount || 0,
          failureReason: localMigration.failureReason,
          createdAt: localMigration.createdAt?.toISOString(),
          completedAt: localMigration.completedAt?.toISOString(),
          repositoryName: localMigration.repositoryName,
          enterpriseName: localMigration.enterpriseName,
          organizationName: localMigration.organizationName,
          targetOrganizationName: localMigration.targetOrganizationName,
          duration: localMigration.duration,
          migrationSource: localMigration.migrationSource
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
            migrations: organizationMigrations(first: 100) {
              nodes {
                state
                createdAt
                completedAt
              }
              totalCount
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

        const migrations = response.data.data.enterprise.migrations.nodes;
        const totalMigrations = migrations.length;
        const completedMigrations = migrations.filter((m: Migration) => m.state === 'SUCCEEDED').length;
        const failedMigrations = migrations.filter((m: Migration) => m.state === 'FAILED').length;
        const inProgressMigrations = migrations.filter((m: Migration) => m.state === 'IN_PROGRESS').length;

        // Calculate average duration for completed migrations
        const completedWithDuration = migrations.filter((m: Migration) => 
          m.state === 'SUCCEEDED' && m.completedAt && m.createdAt
        );
        
        const averageDuration = completedWithDuration.length > 0
          ? completedWithDuration.reduce((acc: number, m: Migration) => {
              if (!m.completedAt) return acc; // TypeScript guard
              const duration = new Date(m.completedAt).getTime() - new Date(m.createdAt).getTime();
              return acc + duration;
            }, 0) / completedWithDuration.length / (1000 * 60) // Convert to minutes
          : null;

        return {
          totalMigrations,
          completedMigrations,
          failedMigrations,
          inProgressMigrations,
          averageDuration
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
    syncMigrations: async (_: any, { enterpriseName, token }: { enterpriseName: string, token: string }) => {
      try {
        console.log(`[Sync] Starting migration sync for enterprise: ${enterpriseName}`);
        
        // Fetch organizations
        console.log(`[Sync] Fetching organizations for enterprise ${enterpriseName}`);
        const organizations = await fetchAllOrganizations(enterpriseName, token);
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
      for (const org of orgs) {
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