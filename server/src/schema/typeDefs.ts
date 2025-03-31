import gql from 'graphql-tag';

export const typeDefs = gql`
  enum MigrationState {
    PENDING
    IN_PROGRESS
    FAILED
    SUCCEEDED
    NOT_STARTED
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type MigrationConnection {
    nodes: [RepositoryMigration!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type OrganizationConnection {
    nodes: [Organization!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type Organization {
    id: ID!
    login: String!
    name: String
  }

  type Enterprise {
    organizations(first: Int!, after: String): OrganizationConnection!
  }

  type MigrationSource {
    id: ID!
    name: String!
    type: String!
    url: String!
  }

  type RepositoryMigration {
    id: ID!
    githubId: String!
    databaseId: String
    downloadUrl: String
    excludeAttachments: Boolean
    excludeGitData: Boolean
    excludeOwnerProjects: Boolean
    excludeReleases: Boolean
    locked: Boolean
    sourceUrl: String
    state: MigrationState!
    warningsCount: Int!
    failureReason: String
    createdAt: String!
    completedAt: String
    duration: Int
    repositoryName: String!
    enterpriseName: String!
    organizationName: String!
    targetOrganizationName: String
    migrationSource: MigrationSource
  }

  type OrgAccessStatus {
    orgId: ID!
    orgLogin: String!
    hasAccess: Boolean!
    errorMessage: String
    lastChecked: String!
    enterpriseName: String!
  }

  type Query {
    enterprise(slug: String!): Enterprise
    allMigrations(
      state: MigrationState
      first: Int = 50
      after: String
      enterpriseName: String
      organizationName: String
    ): MigrationConnection!
    migration(id: ID!): RepositoryMigration
    enterpriseStats(enterpriseName: String!): EnterpriseStats!
    orgAccessStatus(enterpriseName: String!): [OrgAccessStatus!]!
  }

  type EnterpriseStats {
    totalMigrations: Int!
    completedMigrations: Int!
    failedMigrations: Int!
    inProgressMigrations: Int!
    averageDuration: Float
  }

  type MigrationResponse {
    success: Boolean!
    message: String
  }

  type Mutation {
    syncMigrations(enterpriseName: String!, token: String!, selectedOrganizations: [String!]): MigrationResponse!
    updateMigrationState(githubId: ID!, state: MigrationState!): RepositoryMigration
    checkOrgAccess(enterpriseName: String!, token: String!): [OrgAccessStatus!]!
  }
`;