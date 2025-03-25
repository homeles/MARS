import { gql } from 'graphql-tag';

export const typeDefs = gql`
  enum MigrationState {
    PENDING
    QUEUED
    IN_PROGRESS
    SUCCEEDED
    FAILED
    UNKNOWN
  }

  type PageInfo {
    hasPreviousPage: Boolean
    startCursor: String
    endCursor: String
  }

  type RepositoryMigration {
    id: ID!
    repositoryName: String!
    createdAt: String!
    state: MigrationState!
    failureReason: String
    migrationLogUrl: String
    enterpriseName: String
    duration: String
    completedAt: String
  }

  type RepositoryMigrationsResponse {
    nodes: [RepositoryMigration]!
    pageInfo: PageInfo!
  }

  type Query {
    # Get migrations by state
    repositoryMigrations(state: MigrationState!, before: String): RepositoryMigrationsResponse
    
    # Get migration by ID
    repositoryMigration(id: ID!): RepositoryMigration
    
    # Get all migrations from local database
    allMigrations(
      state: MigrationState, 
      limit: Int, 
      offset: Int, 
      sortField: String, 
      sortOrder: String
    ): [RepositoryMigration]!
  }

  type Mutation {
    # Sync migrations from GitHub to local database
    syncMigrations(enterpriseName: String!, token: String!): Boolean
    
    # Manually add migration to local database
    addMigration(
      repositoryName: String!, 
      state: MigrationState!, 
      createdAt: String!
    ): RepositoryMigration
    
    # Update migration in local database
    updateMigration(
      id: ID!, 
      state: MigrationState, 
      completedAt: String, 
      failureReason: String
    ): RepositoryMigration
  }
`;