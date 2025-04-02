import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import MigrationStatusBadge from '../components/MigrationStatusBadge';
import { Migration } from '../types';
import { logger } from '../utils/logger';

const GET_MIGRATION = gql`
  query GetMigration($id: ID!) {
    migration(id: $id) {
      id
      githubId
      repositoryName
      createdAt
      state
      warningsCount
      failureReason
      organizationName
      enterpriseName
      duration
      sourceUrl
      migrationSource {
        id
        name
        type
        url
      }
    }
  }
`;

const MigrationDetails: React.FC = () => {
  const { id } = useParams();
  const { data, loading, error } = useQuery(GET_MIGRATION, {
    variables: { id },
    onError: (error) => {
      logger.error('Failed to fetch migration details', { error: error.message });
    }
  });

  const migration: Migration | undefined = data?.migration;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-600 dark:text-gray-300">Loading migration details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
        <h1 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">Error Loading Migration</h1>
        <p className="text-red-600 dark:text-red-300">{error.message}</p>
        <Link to="/" className="mt-4 inline-block text-red-600 dark:text-red-300 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  if (!migration) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900 p-4 rounded-lg">
        <h1 className="text-xl font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Migration Not Found</h1>
        <p className="text-yellow-600 dark:text-yellow-300">The requested migration could not be found.</p>
        <Link to="/" className="mt-4 inline-block text-yellow-600 dark:text-yellow-300 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const formattedDate = new Date(migration.createdAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  const repoUrl = `https://github.com/${migration.organizationName}/${migration.repositoryName}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Migration Details
        </h1>
        <Link
          to="/"
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-card rounded-lg">
        <div className="p-6">
          {/* Header Information */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {migration.repositoryName}
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Organization: {migration.organizationName}
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <MigrationStatusBadge status={migration.state} />
            </div>
          </div>

          {/* Migration Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</h3>
                <p className="mt-1 text-gray-900 dark:text-white">{formattedDate}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</h3>
                <p className="mt-1 text-gray-900 dark:text-white">
                  {migration.duration ? `${Math.round(migration.duration / 1000 / 60)} minutes` : 'N/A'}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Warnings</h3>
                <p className="mt-1 text-gray-900 dark:text-white">{migration.warningsCount || 0}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Migration Source</h3>
                <p className="mt-1 text-gray-900 dark:text-white">
                  {migration.migrationSource ? (
                    <a
                      href={migration.migrationSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      {migration.migrationSource.name} ({migration.migrationSource.type})
                    </a>
                  ) : (
                    'N/A'
                  )}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Repository URL</h3>
                <p className="mt-1">
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {repoUrl}
                  </a>
                </p>
              </div>

              {migration.sourceUrl && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Source URL</h3>
                  <p className="mt-1">
                    <a
                      href={migration.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      {migration.sourceUrl}
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Failure Reason (if any) */}
          {migration.failureReason && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Failure Reason</h3>
              <p className="mt-1 text-red-600 dark:text-red-300">{migration.failureReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MigrationDetails;