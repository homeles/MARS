import express, { Router, Request, Response } from 'express';
import { RepositoryMigration, MigrationState } from '../models/RepositoryMigration';
import axios, { AxiosError } from 'axios';

const router = Router();
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

interface SyncBody {
  enterpriseName: string;
  token: string;
  state?: string;
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

// Get all migrations from local database
router.get('/', async (req: Request, res: Response) => {
  try {
    const migrations = await RepositoryMigration.find()
      .collation({ locale: 'en', strength: 2 }) // strength: 2 means case-insensitive
      .sort({ createdAt: -1 });
    res.json(migrations);
  } catch (error) {
    console.error('Error fetching migrations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get migration by ID from local database
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const migration = await RepositoryMigration.findById(req.params.id);
    if (!migration) {
      res.status(404).json({ error: 'Migration not found' });
      return;
    }
    res.json(migration);
  } catch (error) {
    console.error('Error fetching migration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify enterprise access using GraphQL API
async function verifyEnterpriseAccess(enterpriseName: string, token: string): Promise<boolean> {
  try {
    const query = `
      query verifyAccess($slug: String!) {
        enterprise(slug: $slug) {
          id
          slug
        }
      }
    `;

    const response = await axios.post(
      GITHUB_GRAPHQL_URL,
      {
        query,
        variables: { slug: enterpriseName }
      },
      {
        headers: {
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    return !response.data.errors && response.data.data.enterprise;
  } catch (error) {
    return false;
  }
}

// Sync migrations from GitHub using GraphQL API
router.post('/sync', async (req: Request<{}, {}, SyncBody>, res: Response) => {
  try {
    const { enterpriseName, token, state } = req.body;
    
    if (!enterpriseName || !token) {
      res.status(400).json({ error: 'Enterprise name and GitHub token are required' });
      return;
    }

    // Verify enterprise access
    const hasAccess = await verifyEnterpriseAccess(enterpriseName, token);
    if (!hasAccess) {
      res.status(403).json({
        error: `No access to enterprise "${enterpriseName}". Token might be missing required scopes or you don't have admin access.`,
        details: {
          enterprise: enterpriseName,
          requiredScopes: ['admin:enterprise', 'read:enterprise']
        }
      });
      return;
    }

    let allMigrations: any[] = [];
    
    // First, get the list of organizations
    const orgQuery = `
      query getOrganizations($enterprise: String!) {
        enterprise(slug: $enterprise) {
          organizations(first: 100) {
            nodes {
              id
              login
            }
          }
        }
      }
    `;

    const orgsResponse = await axios.post(
      GITHUB_GRAPHQL_URL,
      {
        query: orgQuery,
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

    const organizations = orgsResponse.data.data.enterprise.organizations.nodes;

    // For each organization, fetch its migrations
    for (const org of organizations) {
      let hasMorePages = true;
      let cursor: string | null = null;

      while (hasMorePages) {
        const migrationsQuery = `
          query getOrgMigrations($org: String!, $before: String, $state: String) {
            organization(login: $org) {
              repositoryMigrations(
                last: 100,
                before: $before,
                states: [$state],
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
                  migrationLogUrl
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

        try {
          const response: { data: OrgMigrationsResponse } = await axios.post(
            GITHUB_GRAPHQL_URL,
            {
              query: migrationsQuery,
              variables: {
                org: org.login,
                before: cursor,
                state: state ? state.toUpperCase() : null
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
            console.error(`Error fetching migrations for org ${org.login}:`, response.data.errors);
            continue;
          }

          const migrations = response.data.data.organization.repositoryMigrations;
          const orgMigrations = migrations.nodes.map((m: any) => ({
            ...m,
            enterpriseName,
            organizationName: org.login
          }));
          
          allMigrations = [...allMigrations, ...orgMigrations];

          // Update pagination info
          hasMorePages = migrations.pageInfo.hasPreviousPage;
          cursor = migrations.pageInfo.startCursor;

          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error fetching migrations for org ${org.login}:`, error);
          continue;
        }
      }
    }

    // Save migrations to database
    for (const migration of allMigrations) {
      const createdAtDate = new Date(migration.createdAt);
      if (isNaN(createdAtDate.getTime())) {
        console.error('Invalid createdAt date:', {
          migrationId: migration.id,
          createdAt: migration.createdAt
        });
        continue;
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
          migrationSource: migration.migrationSource,
          organizationName: migration.organizationName
        });
      }
    }

    res.json({
      success: true,
      total: allMigrations.length,
      migrations: allMigrations,
      enterprise: enterpriseName
    });

  } catch (error) {
    console.error('Error syncing migrations:', error);
    res.status(500).json({ 
      error: 'Failed to sync migrations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Export all migrations as CSV
// Note: In production, this endpoint should include rate limiting to prevent DoS attacks
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    // Fetch all migrations from the database, sorted by createdAt descending
    const migrations = await RepositoryMigration.find()
      .collation({ locale: 'en', strength: 2 })
      .sort({ createdAt: -1 });

    // CSV headers
    const csvHeaders = [
      'Repository Name',
      'Organization',
      'Status',
      'Created At',
      'Duration (minutes)',
      'Warnings Count',
      'Failure Reason',
      'Enterprise Name',
      'Source URL',
      'GitHub ID',
      'Database ID',
      'Migration Log URL',
      'Migration Source ID',
      'Migration Source Name',
      'Migration Source Type',
      'Migration Source URL'
    ];

    // Convert migrations to CSV rows
    const csvRows = migrations.map((migration) => {
      const duration = migration.duration ? Math.round(migration.duration / 1000 / 60) : '';
      const createdAt = migration.createdAt ? new Date(migration.createdAt).toISOString() : '';
      
      return [
        `"${migration.repositoryName?.replace(/"/g, '""') || ''}"`,
        `"${migration.organizationName?.replace(/"/g, '""') || ''}"`,
        `"${migration.state || ''}"`,
        `"${createdAt}"`,
        `"${duration}"`,
        `"${migration.warningsCount || 0}"`,
        `"${(migration.failureReason || '').replace(/"/g, '""')}"`,
        `"${migration.enterpriseName?.replace(/"/g, '""') || ''}"`,
        `"${migration.sourceUrl?.replace(/"/g, '""') || ''}"`,
        `"${migration.githubId?.replace(/"/g, '""') || ''}"`,
        `"${migration.databaseId?.replace(/"/g, '""') || ''}"`,
        `"${migration.migrationLogUrl?.replace(/"/g, '""') || ''}"`,
        `"${migration.migrationSource?.id?.replace(/"/g, '""') || ''}"`,
        `"${migration.migrationSource?.name?.replace(/"/g, '""') || ''}"`,
        `"${migration.migrationSource?.type?.replace(/"/g, '""') || ''}"`,
        `"${migration.migrationSource?.url?.replace(/"/g, '""') || ''}"`
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    // Set appropriate headers for CSV download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `migrations-export-${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting migrations to CSV:', error);
    res.status(500).json({ 
      error: 'Failed to export migrations to CSV',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as migrationRoutes };