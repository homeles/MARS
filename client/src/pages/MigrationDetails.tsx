import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import MigrationStatusBadge from '../components/MigrationStatusBadge';

// GraphQL query to fetch a single migration by ID
const GET_MIGRATION = gql`
  query GetMigration($id: ID!) {
    repositoryMigration(id: $id) {
      id
      repositoryName
      state
      createdAt
      completedAt
      duration
      failureReason
      migrationLogUrl
      enterpriseName
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

  if (!data || !data.repositoryMigration) {
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

  const migration = data.repositoryMigration;
  const createdDate = new Date(migration.createdAt);
  const completedDate = migration.completedAt ? new Date(migration.completedAt) : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Migration Details: {migration.repositoryName}
        </h1>
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
              </dd>
            </div>
            
            <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Enterprise</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {migration.enterpriseName || 'N/A'}
              </dd>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
              <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                <MigrationStatusBadge status={migration.state} />
              </dd>
            </div>
            
            <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Requested at</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {createdDate.toLocaleString()}
              </dd>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Completed at</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {completedDate ? completedDate.toLocaleString() : 'Not completed yet'}
              </dd>
            </div>
            
            <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {migration.duration || 'In progress'}
              </dd>
            </div>

            {migration.failureReason && (
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Failure reason</dt>
                <dd className="mt-1 text-sm text-red-600 dark:text-red-300 sm:mt-0 sm:col-span-2">
                  {migration.failureReason}
                </dd>
              </div>
            )}
            
            {migration.migrationLogUrl && (
              <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Migration log</dt>
                <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                  <a 
                    href={migration.migrationLogUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    View migration log
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