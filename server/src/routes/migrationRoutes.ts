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

// Get all migrations from local database
router.get('/', async (req: Request, res: Response) => {
  try {
    const migrations = await RepositoryMigration.find().sort({ createdAt: -1 });
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

    // Query migrations using GraphQL
    const query = `
      query getEnterpriseMigrations($enterprise: String!) {
        enterprise(slug: $enterprise) {
          organizations(first: 100) {
            nodes {
              migrations(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
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

      const organizations = response.data.data.enterprise.organizations.nodes;
      let allMigrations: any[] = [];

      // Collect migrations from all organizations
      organizations.forEach((org: any) => {
        const orgMigrations = org.migrations.nodes.map((m: any) => ({
          ...m,
          enterpriseName
        }));
        allMigrations = [...allMigrations, ...orgMigrations];
      });

      // Filter migrations by state if specified
      const filteredMigrations = state && state !== 'ALL'
        ? allMigrations.filter(m => m.state === state.toUpperCase())
        : allMigrations;

      // Save migrations to database
      for (const migration of filteredMigrations) {
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
            repositoryName: migration.repositoryName,
            enterpriseName: enterpriseName,
            migrationSource: migration.migrationSource
          },
          { upsert: true, new: true }
        );
      }

      res.json({
        success: true,
        total: filteredMigrations.length,
        migrations: filteredMigrations,
        enterprise: enterpriseName
      });

    } catch (graphqlError: any) {
      const error = graphqlError as AxiosError;
      console.error('GitHub GraphQL API Error:', {
        enterprise: enterpriseName,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorMessage: error.response?.data,
      });

      res.status(error.response?.status || 500).json({
        error: 'Failed to fetch migrations',
        details: {
          enterprise: enterpriseName,
          response: error.response?.data
        }
      });
    }
  } catch (error) {
    console.error('Error syncing migrations:', error);
    res.status(500).json({ 
      error: 'Failed to sync migrations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as migrationRoutes };