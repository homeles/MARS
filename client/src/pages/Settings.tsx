import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { logger } from '../utils/logger';
import { gql } from '@apollo/client';

const SYNC_MIGRATIONS = gql`
  mutation SyncMigrations($enterpriseName: String!, $token: String!, $selectedOrganizations: [String!]) {
    syncMigrations(enterpriseName: $enterpriseName, token: $token, selectedOrganizations: $selectedOrganizations) {
      success
      message
    }
  }
`;

const CHECK_ORG_ACCESS = gql`
  mutation CheckOrgAccess($enterpriseName: String!, $token: String!) {
    checkOrgAccess(enterpriseName: $enterpriseName, token: $token) {
      orgId
      orgLogin
      hasAccess
      errorMessage
      lastChecked
    }
  }
`;

const GET_ENTERPRISE_ORGS = gql`
  query GetEnterpriseOrgs($enterpriseName: String!) {
    enterprise(slug: $enterpriseName) {
      organizations(first: 100) {
        nodes {
          login
        }
      }
    }
  }
`;

const GET_ORG_ACCESS_STATUS = gql`
  query GetOrgAccessStatus($enterpriseName: String!) {
    orgAccessStatus(enterpriseName: $enterpriseName) {
      orgId
      orgLogin
      hasAccess
      errorMessage
      lastChecked
    }
  }
`;

interface AccessStatus {
  orgLogin: string;
  hasAccess: boolean;
}

interface LogData {
  error: string;
}

export const Settings: React.FC = () => {
  const [selectedEnterprise] = useState<string>(process.env.GITHUB_ENTERPRISE_NAME || '');
  const [accessToken] = useState<string>(process.env.GITHUB_TOKEN || '');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  
  const [syncMigrations] = useMutation(SYNC_MIGRATIONS);
  const [checkOrgAccessMutation] = useMutation(CHECK_ORG_ACCESS);

  const { data: organizationsData, loading: orgsLoading, error: orgsError } = useQuery(GET_ENTERPRISE_ORGS, {
    variables: { enterpriseName: selectedEnterprise },
    skip: !selectedEnterprise || !accessToken
  });

  const organizations = organizationsData?.enterprise?.organizations?.nodes?.map((node: { login: string }) => node.login) || [];

  const { data: accessData, refetch: refetchAccess } = useQuery(GET_ORG_ACCESS_STATUS, {
    variables: { enterpriseName: selectedEnterprise },
    skip: !selectedEnterprise
  });

  const accessStatuses: AccessStatus[] = accessData?.orgAccessStatus || [];

  const handleOrgSelection = (orgLogin: string, checked: boolean) => {
    if (checked) {
      setSelectedOrgs([...selectedOrgs, orgLogin]);
    } else {
      setSelectedOrgs(selectedOrgs.filter(org => org !== orgLogin));
    }
  };

  const toggleAllOrgs = (checked: boolean) => {
    if (checked) {
      const accessibleOrgs = accessStatuses
        .filter(status => status.hasAccess)
        .map(status => status.orgLogin);
      setSelectedOrgs(accessibleOrgs);
    } else {
      setSelectedOrgs([]);
    }
  };

  const checkOrgAccess = async () => {
    setCheckingAccess(true);
    
    try {
      await checkOrgAccessMutation({
        variables: {
          enterpriseName: selectedEnterprise,
          token: accessToken
        }
      });
      
      await refetchAccess();
    } catch (error) {
      const errorData: LogData = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      logger.error('Failed to check organization access', errorData);
    } finally {
      setCheckingAccess(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    
    try {
      const result = await syncMigrations({
        variables: {
          enterpriseName: selectedEnterprise,
          token: accessToken,
          selectedOrganizations: selectedOrgs.length > 0 ? selectedOrgs : null
        }
      });

      if (result.data.syncMigrations.success) {
        alert('Successfully synced migrations!');
      } else {
        alert(`Error syncing migrations: ${result.data.syncMigrations.message}`);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error : new Error('Unknown error occurred'));
      const logData: LogData = {
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      logger.error('Error syncing migrations:', logData);
    } finally {
      setSyncing(false);
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
              disabled={checkingAccess || !accessToken}
              className={`px-4 py-2 rounded-md text-white ${
                !checkingAccess && accessToken
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {checkingAccess ? 'Checking Access...' : 'Refresh Permissions'}
            </button>
            <button
              onClick={handleSync}
              disabled={!accessToken || syncing || selectedOrgs.length === 0}
              className={`px-4 py-2 rounded-md text-white ${
                accessToken && !syncing && selectedOrgs.length > 0
                  ? 'bg-primary-600 hover:bg-primary-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {syncing ? 'Syncing...' : 'Sync Selected Organizations'}
            </button>
          </div>
        </div>
        
        {syncError && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300 rounded-md">
            Error syncing migrations: {syncError.message}
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">GitHub Token Status</h3>
            <p className={`mt-1 text-sm ${accessToken ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {accessToken ? '✓ Token is configured' : '✗ Token is not configured'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Enterprise Name</h3>
            <p className={`mt-1 text-sm ${selectedEnterprise ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}>
              {selectedEnterprise || 'Not configured'}
            </p>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Organizations</h3>
            
            {orgsLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Loading organizations...
              </div>
            ) : orgsError ? (
              <div className="text-sm text-red-600 dark:text-red-400">
                Error: {orgsError.message}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Select All Checkbox */}
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="selectAll"
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                    checked={selectedOrgs.length === accessStatuses.filter(status => status.hasAccess).length}
                    onChange={(e) => toggleAllOrgs(e.target.checked)}
                  />
                  <label htmlFor="selectAll" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Select All Organizations
                  </label>
                </div>
                
                {/* Organization List */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {organizations.map((org: string) => {
                    const status = accessStatuses.find(s => s.orgLogin === org);
                    const hasAccess = status?.hasAccess ?? false;
                    
                    return (
                      <div key={org} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`org-${org}`}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                          checked={selectedOrgs.includes(org)}
                          onChange={(e) => handleOrgSelection(org, e.target.checked)}
                          disabled={!hasAccess}
                        />
                        <label
                          htmlFor={`org-${org}`}
                          className={`text-sm ${
                            hasAccess
                              ? 'text-gray-700 dark:text-gray-300'
                              : 'text-gray-400 dark:text-gray-600'
                          }`}
                        >
                          {org}
                          {!hasAccess && (
                            <span className="ml-2 text-xs text-red-500">
                              (No Access)
                            </span>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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