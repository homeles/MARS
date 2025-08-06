import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, gql } from '@apollo/client';
import MigrationStatusBadge from '../components/MigrationStatusBadge';
import Tooltip from '../components/Tooltip';
import { Migration } from '../types';
import { logger } from '../utils/logger';

const DELETE_MIGRATION = gql`
  mutation DeleteMigration($id: ID!) {
    deleteMigration(id: $id)
  }
`;

const GET_MIGRATION = gql`
  query GetMigration($id: ID!) {
    migration(id: $id) {
      id
      githubId
      databaseId
      repositoryName
      sourceUrl
      state
      warningsCount
      failureReason
      createdAt
      organizationName
      enterpriseName
      targetOrganizationName
      duration
      migrationLogUrl
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
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(GET_MIGRATION, {
    variables: { id },
    onError: (error) => {
      logger.error('Failed to fetch migration details', { error: error.message });
    }
  });

  const [deleteMigration] = useMutation(DELETE_MIGRATION, {
    onCompleted: () => {
      logger.info('Migration deleted successfully');
      navigate('/');
    },
    onError: (error) => {
      logger.error('Failed to delete migration', { error: error.message });
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

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this migration from the local database? This action cannot be undone.')) {
      deleteMigration({
        variables: { id: migration.id }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Migration Details
        </h1>
        <div className="flex space-x-4">
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            type="button"
          >
            Delete Migration
          </button>
          <Link
            to="/"
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-card rounded-lg">
        <div className="p-6">
          {/* Header Information */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {migration.repositoryName}
              </h2>
              <div className="space-y-1">
                <p className="text-gray-600 dark:text-gray-300">
                  Organization: {migration.organizationName}
                </p>
                <p className="text-gray-600 dark:text-gray-300">
                  Enterprise: {migration.enterpriseName}
                </p>
                {migration.targetOrganizationName && (
                  <p className="text-gray-600 dark:text-gray-300">
                    Target Organization: {migration.targetOrganizationName}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 md:mt-0">
              <MigrationStatusBadge status={migration.state} />
            </div>
          </div>

          {/* Migration Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Core Details */}
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Core Information</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">GitHub ID</h4>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{migration.githubId}</p>
                  </div>
                  {migration.databaseId && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Database ID</h4>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{migration.databaseId}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</h4>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{formattedDate}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center">
                      <Tooltip 
                        text="The duration is not a value directly reported by the migration process. Instead, it is estimated based on the time difference between when the migration was created and when the sync process last detected the status change for example, from In-Progress to Completed. Reducing the sync interval provides a more accurate duration estimate"
                        position="right"
                        width={350}
                      >
                        <span className="flex items-center cursor-help">
                          Duration
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                      </Tooltip>
                    </h4>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">
                      {migration.duration ? `${Math.round(migration.duration / 1000 / 60)} minutes` : 'Not completed'}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Warnings</h4>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">
                      {migration.warningsCount || 0} {migration.warningsCount === 1 ? 'warning' : 'warnings'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - URLs and Source Info */}
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Repository Information</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Repository URL</h4>
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 block break-all"
                    >
                      {repoUrl}
                    </a>
                  </div>

                  {migration.sourceUrl && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Source URL</h4>
                      <a
                        href={migration.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 block break-all"
                      >
                        {migration.sourceUrl}
                      </a>
                    </div>
                  )}

                  {migration.migrationLogUrl && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Migration Log URL</h4>
                      <a
                        href={migration.migrationLogUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 block break-all"
                      >
                        View Migration Logs
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Migration Source Details */}
              {migration.migrationSource && (
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Migration Source</h3>
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Source Name</h4>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{migration.migrationSource.name}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Source Type</h4>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{migration.migrationSource.type}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Source URL</h4>
                      <a
                        href={migration.migrationSource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 block break-all"
                      >
                        {migration.migrationSource.url}
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Failure Reason (if any) */}
          {migration.failureReason && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Failure Reason</h3>
              <p className="mt-1 text-sm text-red-600 dark:text-red-300">{migration.failureReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MigrationDetails;