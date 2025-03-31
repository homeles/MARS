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
    };
  };
}

interface GraphQLResponse {
  data: GraphQLData;
  errors?: any[];
}

async function fetchOrganizationMigrations(organizationName: string, token: string) {
  let hasNextPage = true;
  let endCursor: string | null = null;
  let page = 1;
  const allMigrations: any[] = [];

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
            cursor: endCursor
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

      const { nodes, pageInfo }: { 
        nodes: any[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null; }
      } = responseData.data.organization.repositoryMigrations;
      
      logger.info('MigrationFetcher', 'Fetched migrations page', {
        organization: organizationName,
        page,
        nodesCount: nodes.length,
        hasMore: pageInfo.hasNextPage
      });

      allMigrations.push(...nodes);
      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;
      page++;
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

  return allMigrations;
}