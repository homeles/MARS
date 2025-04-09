import axios, { AxiosResponse } from 'axios';
import { logger } from './utils/logger';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GraphQLData {
  organization: {
    repositoryMigrations: {
      nodes: any[];
      pageInfo: PageInfo;
      totalCount: number;
    };
  };
}

interface GraphQLResponse {
  data: GraphQLData;
  errors?: any[];
}

async function fetchOrganizationMigrations(organizationName: string, token: string) {
  let hasNextPage = true;
  let cursor: string | null = null;
  let page = 1;
  const allMigrations: any[] = [];
  let totalMigrationsFound = 0;
  let estimatedTotalPages = 1;

  while (hasNextPage) {
    logger.graphql('MigrationFetcher', organizationName, page, true);
    
    try {
      const query = `
        query($org: String!, $cursor: String) {
          organization(login: $org) {
            repositoryMigrations(first: 100, after: $cursor) {
              nodes {
                id
                sourceUrl
                targetUrl
                state
                failureReason
                createdAt
                repositoryName
              }
              pageInfo {
                hasNextPage
                endCursor
              }
              totalCount
            }
          }
        }
      `;

      const { data: responseData }: { data: GraphQLResponse } = await axios.post<GraphQLResponse>(
        GITHUB_GRAPHQL_URL,
        {
          query,
          variables: {
            org: organizationName,
            cursor: cursor
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (responseData.errors) {
        logger.error('MigrationFetcher', 'GraphQL Error', {
          organization: organizationName,
          page,
          errors: responseData.errors
        });
        throw new Error(`GraphQL Error: ${JSON.stringify(responseData.errors)}`);
      }

      const { nodes, pageInfo, totalCount }: { 
        nodes: any[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null; };
        totalCount: number;
      } = responseData.data.organization.repositoryMigrations;
      
      // Calculate total pages based on total count (100 items per page)
      if (page === 1) {
        estimatedTotalPages = Math.ceil(totalCount / 100);
      }

      totalMigrationsFound += nodes.length;
      logger.progress('MigrationFetcher', organizationName, page, estimatedTotalPages, totalMigrationsFound);

      allMigrations.push(...nodes);
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
      page++;

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error('MigrationFetcher', 'Failed to fetch migrations', {
        organization: organizationName,
        page,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  logger.info('MigrationFetcher', 'Completed fetching all migrations', {
    organization: organizationName,
    totalPages: page - 1,
    totalMigrations: allMigrations.length
  });

  return { migrations: allMigrations, totalPages: page - 1 };
}