import axios from 'axios';
import { MigrationState, RepositoryMigration, OrgAccessStatus } from '../models/RepositoryMigration';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

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

      const query = `
        query getMigration($id: ID!) {
          node(id: $id) {
            ... on Migration {
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
    syncMigrations: async (_: unknown, { enterpriseName, token }: { enterpriseName: string; token: string }) => {
      try {
        // Check if we have admin access to the organization
        const checkPermissionQuery = `
          query checkOrgPermission($organization: String!) {
            organization(login: $organization) {
              viewerCanAdminister
            }
          }
        `;

        const permissionResponse = await axios.post(
          GITHUB_GRAPHQL_URL,
          {
            query: checkPermissionQuery,
            variables: { 
              organization: enterpriseName
            }
          },
          {
            headers: {
              'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          }
        );

        if (permissionResponse.data.errors) {
          throw new Error(permissionResponse.data.errors[0].message);
        }

        const hasAdminAccess = permissionResponse.data.data.organization?.viewerCanAdminister;
        
        if (!hasAdminAccess) {
          return {
            success: false,
            message: `You don't have admin access to the organization ${enterpriseName}. Please make sure you have the correct permissions.`
          };
        }

        // If we have admin access, proceed with migration sync
        const query = `
          query getRepositoryMigrations($organization: String!, $first: Int!) {
            organization(login: $organization) {
              repositoryMigrations(first: $first, orderBy: {field: CREATED_AT, direction: DESC}) {
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
              }
            }
          }
        `;

        const response = await axios.post(
          GITHUB_GRAPHQL_URL,
          {
            query,
            variables: { 
              organization: enterpriseName,
              first: 100
            }
          },
          {
            headers: {
              'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          }
        );

        if (response.data.errors) {
          const errorMessage = response.data.errors[0].message;
          throw new Error(`Failed to fetch migrations: ${errorMessage}`);
        }

        const migrations = response.data.data.organization.repositoryMigrations.nodes;
        
        if (!migrations || migrations.length === 0) {
          return {
            success: true,
            message: `No migrations found for ${enterpriseName}`
          };
        }

        // Save migrations to database
        for (const migration of migrations) {
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
              organizationName: enterpriseName,
              enterpriseName: enterpriseName,
              migrationSource: migration.migrationSource
            },
            { upsert: true, new: true }
          );
        }

        return {
          success: true,
          message: `Successfully synced ${migrations.length} migrations from ${enterpriseName}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          success: false,
          message: `Error syncing migrations: ${errorMessage}`
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