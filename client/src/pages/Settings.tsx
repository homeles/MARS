import React, { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { logger } from '../utils/logger';

interface Organization {
  id: string;
  login: string;
  name?: string;
}

interface AccessStatus {
  orgId: string;
  orgLogin: string;
  hasAccess: boolean;
  errorMessage?: string;
  lastChecked: string;
}

const GET_ENTERPRISE_ORGS = gql`
  query getOrganizations($enterprise: String!) {
    enterprise(slug: $enterprise) {
      organizations(first: 100) {
        nodes {
          id
          login
          name
        }
      }
    }
  }
`;

const GET_ORG_ACCESS_STATUS = gql`
  query getOrgAccessStatus($enterpriseName: String!) {
    orgAccessStatus(enterpriseName: $enterpriseName) {
      orgId
      orgLogin
      hasAccess
      errorMessage
      lastChecked
    }
  }
`;

const SYNC_MIGRATIONS = gql`
  mutation SyncMigrations($enterpriseName: String!, $token: String!) {
    syncMigrations(enterpriseName: $enterpriseName, token: $token) {
      success
      message
    }
  }
`;

const CHECK_ORG_ACCESS = gql`
  mutation checkOrgAccess($enterpriseName: String!, $token: String!) {
    checkOrgAccess(enterpriseName: $enterpriseName, token: $token) {
      orgId
      orgLogin
      hasAccess
      errorMessage
      lastChecked
    }
  }
`;

const Settings: React.FC = () => {
  const enterpriseName = import.meta.env.VITE_GITHUB_ENTERPRISE_NAME;
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  const hasToken = !!token;
  const [checkingAccess, setCheckingAccess] = useState(false);
  
  const [syncMigrations, { loading: syncing, error: syncError }] = useMutation(SYNC_MIGRATIONS);
  const [checkOrgAccessMutation] = useMutation(CHECK_ORG_ACCESS);
  
  const { data: orgsData, loading: orgsLoading, error: orgsError } = useQuery(GET_ENTERPRISE_ORGS, {
    variables: { enterprise: enterpriseName },
    skip: !enterpriseName || !hasToken
  });

  const { data: accessData, refetch: refetchAccess } = useQuery(GET_ORG_ACCESS_STATUS, {
    variables: { enterpriseName },
    skip: !enterpriseName
  });

  const orgs: Organization[] = orgsData?.enterprise?.organizations?.nodes || [];
  const accessStatuses: AccessStatus[] = accessData?.orgAccessStatus || [];

  const checkOrgAccess = async () => {
    setCheckingAccess(true);
    
    try {
      await checkOrgAccessMutation({
        variables: {
          enterpriseName,
          token
        }
      });
      
      await refetchAccess();
    } catch (error) {
      logger.error('Failed to check organization access', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setCheckingAccess(false);
    }
  };

  const handleSync = async () => {
    try {
      const accessibleOrgs = accessStatuses
        .filter((status: AccessStatus) => status.hasAccess)
        .map((status: AccessStatus) => status.orgLogin);

      const results = await Promise.allSettled(
        accessibleOrgs.map((org: string) =>
          syncMigrations({
            variables: {
              enterpriseName: org,
              token
            }
          })
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        alert(`Successfully synced migrations for ${successful} organizations!`);
      } else {
        alert(`Synced migrations for ${successful} organizations. Failed for ${failed} organizations.`);
      }
    } catch (error) {
      console.error('Error syncing migrations:', error);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Settings</h1>
      
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Environment Configuration</h2>
          <div className="flex gap-4">
            <button
              onClick={checkOrgAccess}
              disabled={checkingAccess || !hasToken}
              className={`px-4 py-2 rounded-md text-white ${
                !checkingAccess && hasToken
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {checkingAccess ? 'Checking Access...' : 'Refresh Permissions'}
            </button>
            <button
              onClick={handleSync}
              disabled={!hasToken || syncing || accessStatuses.filter((status: AccessStatus) => status.hasAccess).length === 0}
              className={`px-4 py-2 rounded-md text-white ${
                hasToken && !syncing && accessStatuses.some((status: AccessStatus) => status.hasAccess)
                  ? 'bg-primary-600 hover:bg-primary-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {syncing ? 'Syncing...' : 'Sync Migrations'}
            </button>
          </div>
        </div>
        
        {syncError && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300 rounded-md">
            Error syncing migrations: {syncError.message}
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">GitHub Token Status</h3>
            <p className={`mt-1 text-sm ${hasToken ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {hasToken ? '✓ Token is configured' : '✗ Token is not configured'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Enterprise Name</h3>
            <p className={`mt-1 text-sm ${enterpriseName ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}>
              {enterpriseName || 'Not configured'}
            </p>
          </div>

          {orgsLoading && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Loading organizations...
            </div>
          )}

          {orgsError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              Error: {orgsError.message}
            </div>
          )}

          {orgs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Organizations</h3>
              <div className="space-y-2">
                {orgs.map((org: Organization) => {
                  const accessStatus = accessStatuses.find((status: AccessStatus) => status.orgLogin === org.login);
                  return (
                    <div key={org.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                      <span className="text-sm text-gray-900 dark:text-gray-100">{org.login}</span>
                      <div className="flex items-center gap-2">
                        {accessStatus?.errorMessage && (
                          <span className="text-xs text-red-500" title={accessStatus.errorMessage}>
                            ⓘ
                          </span>
                        )}
                        {accessStatus && (
                          <span className={`text-sm ${
                            accessStatus.hasAccess 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {accessStatus.hasAccess ? '✓ Has access' : '✗ No access'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {accessStatuses.filter((status: AccessStatus) => status.hasAccess).length === 0 && (
                <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                  Warning: Your token doesn't have the required permissions for any organizations. 
                  Please ensure your token has 'repo' and 'admin:org' scopes.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">How to Configure</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            The application uses environment variables for configuration. To update the settings:
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <li>Create a <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env</code> file in the root directory</li>
            <li>Copy the contents from <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env.example</code></li>
            <li>Update the values for <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">GITHUB_TOKEN</code> and <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">GITHUB_ENTERPRISE_NAME</code></li>
            <li>Restart the application</li>
          </ol>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Required Token Permissions</h3>
          <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">read:enterprise</code> - For listing organizations</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">repo</code> - For accessing repository migrations</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">admin:org</code> - For accessing organization migrations</li>
          </ul>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mt-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">About Repository Migrations</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          This tool helps you monitor GitHub repository migrations across your enterprise organizations. 
          It uses GitHub's GraphQL API to fetch real-time migration status information.
        </p>
        <p className="text-gray-600 dark:text-gray-300">
          For more information about repository migrations, visit the{' '}
          <a 
            href="https://docs.github.com/en/migrations/using-github-enterprise-importer/understanding-github-enterprise-importer/about-github-enterprise-importer" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
          >
            GitHub Enterprise Importer documentation
          </a>.
        </p>
      </div>
    </div>
  );
};

export default Settings;