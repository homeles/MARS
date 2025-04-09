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
    REPOSITORY_NAME
    ORGANIZATION_NAME
    STATE
    WARNINGS_COUNT
    DURATION
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

  type SyncProgress {
    organizationName: String!
    totalPages: Int!
    currentPage: Int!
    migrationsCount: Int!
    isCompleted: Boolean!
    error: String
    estimatedTimeRemainingMs: Int
    elapsedTimeMs: Int
    processingRate: Float
  }

  type OrgSyncHistory {
    login: String!
    totalMigrations: Int!
    totalPages: Int!
    latestMigrationDate: String
    errors: [String]
    elapsedTimeMs: Int!
  }

  type SyncHistory {
    id: ID!
    syncId: String!
    enterpriseName: String!
    startTime: String!
    endTime: String
    organizations: [OrgSyncHistory!]!
    status: String!
    completedOrganizations: Int!
    totalOrganizations: Int!
    createdAt: String!
    updatedAt: String!
  }

  type UserPreference {
    key: String!
    value: String!
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
    syncHistory(syncId: String): SyncHistory
    syncHistories(enterpriseName: String!, limit: Int, offset: Int): [SyncHistory!]!
    userPreferences(keys: [String!]): [UserPreference!]!
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
    progress: [SyncProgress!]
  }

  type Mutation {
    syncMigrations(enterpriseName: String!, token: String!, selectedOrganizations: [String!]): MigrationResponse!
    updateMigrationState(githubId: ID!, state: MigrationState!): RepositoryMigration
    checkOrgAccess(enterpriseName: String!, token: String!): [OrgAccessStatus!]!
    saveUserPreference(key: String!, value: String!): UserPreference!
    saveUserPreferences(preferences: [UserPreferenceInput!]!): [UserPreference!]!
    deleteUserPreference(key: String!): Boolean!
  }

  input UserPreferenceInput {
    key: String!
    value: String!
  }

  type Subscription {
    syncProgressUpdated(enterpriseName: String!): [SyncProgress!]!
    syncHistoryUpdated(enterpriseName: String!, syncId: String): SyncHistory!
  }
`;