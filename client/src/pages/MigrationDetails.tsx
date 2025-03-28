import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import MigrationStatusBadge from '../components/MigrationStatusBadge';

const GET_MIGRATION = gql`
  query GetMigration($id: ID!) {
    migration(id: $id) {
      id
      githubId
      repositoryName
      state
      createdAt
      completedAt
      failureReason
      sourceUrl
      organizationName
      targetOrganizationName
      duration
      warningsCount
      excludeAttachments
      excludeGitData
      excludeOwnerProjects
      excludeReleases
      locked
      databaseId
      downloadUrl
      migrationSource {
        name
        type
        url
      }
    }
  }
`;

const MigrationDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  
  const { loading, error, data } = useQuery(GET_MIGRATION, {
    variables: { id },
    pollInterval: 10000, // Poll every 10 seconds for updates if migration is in progress
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500 dark:text-gray-400">Loading migration details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900 p-6 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Error</h2>
        <p className="text-red-600 dark:text-red-300">{error.message}</p>
        <Link to="/" className="mt-4 inline-block text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
          &larr; Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!data || !data.migration) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900 p-6 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Migration Not Found</h2>
        <p className="text-yellow-600 dark:text-yellow-300">The requested migration could not be found.</p>
        <Link to="/" className="mt-4 inline-block text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
          &larr; Back to Dashboard
        </Link>
      </div>
    );
  }

  const migration = data.migration;
  const createdDate = new Date(migration.createdAt);
  const completedDate = migration.completedAt ? new Date(migration.completedAt) : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Migration Details: {migration.repositoryName}
          </h1>
        </div>
        <Link to="/" className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-lg">
        <div className="px-4 py-5 sm:px-6 bg-gray-50 dark:bg-gray-900">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Repository Migration Information</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Details about the migration process and status.
          </p>
        </div>
        
        <div className="border-t border-gray-200 dark:border-gray-700">
          <dl>
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Repository name</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {migration.repositoryName}
                {migration.state === 'SUCCEEDED' && (
                  <a
                    href={`https://github.com/${migration.organizationName}/${migration.repositoryName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex items-center text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    View on GitHub
                  </a>
                )}
              </dd>
            </div>
            
            <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Organization</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {migration.organizationName}
              </dd>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
              <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                <MigrationStatusBadge status={migration.state} />
              </dd>
            </div>
            
            <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Created at</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {createdDate.toLocaleString()}
              </dd>
            </div>
            
            {completedDate && (
              <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Completed at</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                  {completedDate.toLocaleString()}
                </dd>
              </div>
            )}

            {migration.sourceUrl && (
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Source URL</dt>
                <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                  <a 
                    href={migration.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {migration.sourceUrl}
                  </a>
                </dd>
              </div>
            )}

            {migration.warningsCount > 0 && (
              <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Warnings</dt>
                <dd className="mt-1 text-sm text-yellow-600 dark:text-yellow-400 sm:mt-0 sm:col-span-2">
                  {migration.warningsCount} warning{migration.warningsCount !== 1 ? 's' : ''}
                </dd>
              </div>
            )}

            {migration.duration && (
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                  {Math.round(migration.duration / 1000 / 60)} minutes
                </dd>
              </div>
            )}

            {migration.targetOrganizationName && (
              <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Target Organization</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                  {migration.targetOrganizationName}
                </dd>
              </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Migration Settings</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                <ul className="space-y-2">
                  <li>
                    <span className={migration.excludeAttachments ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {migration.excludeAttachments ? '❌' : '✓'} Attachments
                    </span>
                  </li>
                  <li>
                    <span className={migration.excludeGitData ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {migration.excludeGitData ? '❌' : '✓'} Git Data
                    </span>
                  </li>
                  <li>
                    <span className={migration.excludeOwnerProjects ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {migration.excludeOwnerProjects ? '❌' : '✓'} Owner Projects
                    </span>
                  </li>
                  <li>
                    <span className={migration.excludeReleases ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {migration.excludeReleases ? '❌' : '✓'} Releases
                    </span>
                  </li>
                </ul>
              </dd>
            </div>

            {migration.migrationSource && (
              <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Source Details</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                  <div className="space-y-2">
                    <p><span className="font-medium">Type:</span> {migration.migrationSource.type}</p>
                    <p><span className="font-medium">Name:</span> {migration.migrationSource.name}</p>
                    {migration.migrationSource.url && (
                      <p>
                        <span className="font-medium">URL:</span>{' '}
                        <a 
                          href={migration.migrationSource.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                        >
                          {migration.migrationSource.url}
                        </a>
                      </p>
                    )}
                  </div>
                </dd>
              </div>
            )}

            {migration.downloadUrl && (
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Download URL</dt>
                <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                  <a 
                    href={migration.downloadUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {migration.downloadUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default MigrationDetails;