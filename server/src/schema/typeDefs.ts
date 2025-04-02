import gql from 'graphql-tag';

export const typeDefs = gql`
  enum MigrationState {
    FAILED
    FAILED_VALIDATION
    IN_PROGRESS
    NOT_STARTED
    PENDING_VALIDATION
    QUEUED
    SUCCEEDED
  }

  enum OrderDirection {
    ASC
    DESC
  }

  enum MigrationOrderField {
    CREATED_AT
  }

  input MigrationOrder {
    field: MigrationOrderField!
    direction: OrderDirection!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    totalPages: Int!
    currentPage: Int!
  }

  type MigrationConnection {
    nodes: [RepositoryMigration!]!
    pageInfo: PageInfo!
    totalCount: Int!
    completedCount: Int!
    failedCount: Int!
    inProgressCount: Int!
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
    sourceUrl: String
    state: MigrationState!
    warningsCount: Int!
    failureReason: String
    createdAt: String!
    repositoryName: String!
    enterpriseName: String!
    organizationName: String!
    targetOrganizationName: String
    duration: Int
    migrationSource: MigrationSource
    migrationLogUrl: String
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
      before: String
      after: String
      first: Int
      last: Int
      page: Int
      pageSize: Int
      orderBy: MigrationOrder
      enterpriseName: String
      organizationName: String
      search: String
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