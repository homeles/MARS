import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import { logger } from '../utils/logger';
import { gql } from '@apollo/client';
import SyncProgress from '../components/SyncProgress';
// Using dynamic import for SyncHistoryTable to avoid module resolution issues
const SyncHistoryTable = React.lazy(() => import('../components/SyncHistoryTable'));

const SYNC_MIGRATIONS = gql`
  mutation SyncMigrations($enterpriseName: String!, $token: String!, $selectedOrganizations: [String!]) {
    syncMigrations(enterpriseName: $enterpriseName, token: $token, selectedOrganizations: $selectedOrganizations) {
      success
      message
      progress {
        organizationName
        totalPages
        currentPage
        migrationsCount
        isCompleted
        error
      }
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

const GET_SYNC_HISTORIES = gql`
  query GetSyncHistories($enterpriseName: String!, $limit: Int, $offset: Int) {
    syncHistories(enterpriseName: $enterpriseName, limit: $limit, offset: $offset) {
      syncId
      enterpriseName
      startTime
      endTime
      status
      completedOrganizations
      totalOrganizations
      organizations {
        login
        totalMigrations
        totalPages
        elapsedTimeMs
        errors
        latestMigrationDate
      }
    }
  }
`;

const SYNC_HISTORY_SUBSCRIPTION = gql`
  subscription OnSyncHistoryUpdated($enterpriseName: String!, $syncId: String) {
    syncHistoryUpdated(enterpriseName: $enterpriseName, syncId: $syncId) {
      syncId
      enterpriseName
      startTime
      endTime
      status
      completedOrganizations
      totalOrganizations
      organizations {
        login
        totalMigrations
        totalPages
        elapsedTimeMs
        errors
        latestMigrationDate
      }
    }
  }
`;

const SYNC_PROGRESS_SUBSCRIPTION = gql`
  subscription OnSyncProgressUpdated($enterpriseName: String!) {
    syncProgressUpdated(enterpriseName: $enterpriseName) {
      organizationName
      totalPages
      currentPage
      migrationsCount
      isCompleted
      error
      estimatedTimeRemainingMs
      elapsedTimeMs
      processingRate
    }
  }
`;

const GET_CRON_CONFIG = gql`
  query GetCronConfig($enterpriseName: String!) {
    cronConfig(enterpriseName: $enterpriseName) {
      schedule
      enabled
      lastRun
      nextRun
    }
  }
`;

const UPDATE_CRON_CONFIG = gql`
  mutation UpdateCronConfig($enterpriseName: String!, $schedule: String!, $enabled: Boolean!) {
    updateCronConfig(enterpriseName: $enterpriseName, schedule: $schedule, enabled: $enabled) {
      schedule
      enabled
      lastRun
      nextRun
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
  const [selectedEnterprise] = useState<string>(import.meta.env.VITE_GITHUB_ENTERPRISE_NAME || '');
  const [accessToken] = useState<string>(import.meta.env.VITE_GITHUB_TOKEN || '');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  // Initialize selectedOrgs from localStorage or empty array
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>(() => {
    try {
      const storedOrgs = localStorage.getItem('selectedOrganizations');
      return storedOrgs ? JSON.parse(storedOrgs) : [];
    } catch (error) {
      console.error('Error loading stored organizations:', error);
      return [];
    }
  });
  const [syncHistoryLimit] = useState<number>(10); // Number of records to fetch
  const [syncProgress, setSyncProgress] = useState<Array<{
    organizationName: string;
    totalPages: number;
    currentPage: number;
    migrationsCount: number;
    isCompleted: boolean;
    error?: string;
  }>>([]);
  const [cronSchedule, setCronSchedule] = useState<string>('0 0 * * *'); // Default to daily at midnight
  const [cronEnabled, setCronEnabled] = useState<boolean>(false);

  const [syncMigrations] = useMutation(SYNC_MIGRATIONS);
  const [checkOrgAccessMutation] = useMutation(CHECK_ORG_ACCESS);
  const [updateCronConfig, { loading: updatingCron }] = useMutation(UPDATE_CRON_CONFIG, {
    onCompleted: () => {
      // Refetch cron config after update
      refetchCronConfig();
    }
  });

  const { data: organizationsData, loading: orgsLoading, error: orgsError } = useQuery(GET_ENTERPRISE_ORGS, {
    variables: { enterpriseName: selectedEnterprise },
    skip: !selectedEnterprise || !accessToken
  });

  // Add CronConfig query
  const { data: cronConfigData, refetch: refetchCronConfig } = useQuery(GET_CRON_CONFIG, {
    variables: { enterpriseName: selectedEnterprise },
    skip: !selectedEnterprise,
    onCompleted: (data) => {
      if (data?.cronConfig) {
        setCronSchedule(data.cronConfig.schedule);
        setCronEnabled(data.cronConfig.enabled);
      }
    }
  });

  // Query for sync histories
  const { 
    data: syncHistoriesData, 
    loading: syncHistoriesLoading, 
    error: syncHistoriesError,
    refetch: refetchSyncHistories 
  } = useQuery(GET_SYNC_HISTORIES, {
    variables: { 
      enterpriseName: selectedEnterprise,
      limit: syncHistoryLimit,
      offset: 0
    },
    skip: !selectedEnterprise,
    fetchPolicy: 'network-only'
  });

  // Subscribe to sync history updates
  useSubscription(SYNC_HISTORY_SUBSCRIPTION, {
    variables: { 
      enterpriseName: selectedEnterprise
    },
    skip: !selectedEnterprise,
    onData: () => {
      // Refetch sync histories when a new sync history is updated
      refetchSyncHistories();
    }
  });

  // Effect to load organizations from the last sync if there are no stored selections
  useEffect(() => {
    if (selectedOrgs.length === 0 && 
        syncHistoriesData?.syncHistories && 
        syncHistoriesData.syncHistories.length > 0) {
      
      // Get the most recent sync history
      const latestSync = syncHistoriesData.syncHistories[0];
      
      // Extract organization logins from the successful sync
      if (latestSync && latestSync.status === 'completed' && latestSync.organizations) {
        const syncedOrgs = latestSync.organizations
          .filter((org: { login?: string }) => org && org.login)
          .map((org: { login: string }) => org.login);
        
        if (syncedOrgs.length > 0) {
          console.log('Pre-selecting organizations from the most recent sync:', syncedOrgs);
          setSelectedOrgs(syncedOrgs);
          
          // Save to localStorage
          try {
            localStorage.setItem('selectedOrganizations', JSON.stringify(syncedOrgs));
          } catch (error) {
            console.error('Error saving organization selection to localStorage:', error);
          }
        }
      }
    }
  }, [syncHistoriesData, selectedOrgs.length]);

  const organizations = organizationsData?.enterprise?.organizations?.nodes?.map((node: { login: string }) => node.login) || [];

  const { data: accessData, refetch: refetchAccess } = useQuery(GET_ORG_ACCESS_STATUS, {
    variables: { enterpriseName: selectedEnterprise },
    skip: !selectedEnterprise
  });

  const accessStatuses: AccessStatus[] = accessData?.orgAccessStatus || [];

  // Add subscription with improved error handling and logging
  useSubscription(
    SYNC_PROGRESS_SUBSCRIPTION,
    {
      variables: { enterpriseName: selectedEnterprise },
      skip: !selectedEnterprise || !syncing, // Only subscribe when enterprise is selected and sync is in progress
      onData: ({ data }) => {
        if (data?.data?.syncProgressUpdated) {
          const progressUpdate = data.data.syncProgressUpdated;
          console.log('Received sync progress update:', progressUpdate);
          
          // Update the progress state
          setSyncProgress(progressUpdate);
          
          // Check if all organizations are completed or have errors
          const allCompleted = progressUpdate.every((org: { isCompleted: boolean }) => org.isCompleted === true);
          if (allCompleted && syncing) {
            console.log('All organizations completed syncing');
            // Add a small delay to ensure the final progress state is displayed
            setTimeout(() => setSyncing(false), 1000);
          }
        }
      },
      onError: (error) => {
        console.error('Subscription error:', error);
        logger.error('Sync progress subscription error', { error: error.message });
        // Set syncing to false on error to allow restarting
        setSyncing(false);
      }
    }
  );

  const handleOrgSelection = (orgLogin: string, checked: boolean) => {
    let newSelectedOrgs: string[];
    if (checked) {
      newSelectedOrgs = [...selectedOrgs, orgLogin];
    } else {
      newSelectedOrgs = selectedOrgs.filter((org: string) => org !== orgLogin);
    }
    // Update state
    setSelectedOrgs(newSelectedOrgs);
    // Save to localStorage
    try {
      localStorage.setItem('selectedOrganizations', JSON.stringify(newSelectedOrgs));
    } catch (error) {
      console.error('Error saving organization selection to localStorage:', error);
    }
  };

  const toggleAllOrgs = (checked: boolean) => {
    let newSelectedOrgs: string[];
    if (checked) {
      newSelectedOrgs = accessStatuses
        .filter(status => status.hasAccess)
        .map(status => status.orgLogin);
    } else {
      newSelectedOrgs = [];
    }
    // Update state
    setSelectedOrgs(newSelectedOrgs);
    // Save to localStorage
    try {
      localStorage.setItem('selectedOrganizations', JSON.stringify(newSelectedOrgs));
    } catch (error) {
      console.error('Error saving organization selection to localStorage:', error);
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
      // Save enterprise name to localStorage
      localStorage.setItem('selectedEnterprise', selectedEnterprise);
      
      // Initialize progress for selected organizations
      // ...existing code...
      const initialProgress = selectedOrgs.length > 0 
        ? selectedOrgs.map(org => ({
            organizationName: org,
            totalPages: 0,
            currentPage: 0,
            migrationsCount: 0,
            isCompleted: false,
            error: undefined,
            estimatedTimeRemainingMs: undefined,
            elapsedTimeMs: undefined,
            processingRate: undefined
          }))
        : [];
      
      setSyncProgress(initialProgress);
      console.log('Starting sync with initial progress:', initialProgress);

      const result = await syncMigrations({
        variables: {
          enterpriseName: selectedEnterprise,
          token: accessToken,
          selectedOrganizations: selectedOrgs.length > 0 ? selectedOrgs : null
        }
      });

      if (result.data.syncMigrations.success) {
        // Initial progress update from the mutation result
        if (result.data.syncMigrations.progress?.length > 0) {
          console.log('Initial progress from mutation:', result.data.syncMigrations.progress);
          setSyncProgress(result.data.syncMigrations.progress);
        }
        
        // Keep syncing flag true to maintain subscription
        // We'll set it to false when all orgs are completed or on error
      } else {
        setSyncError(new Error(result.data.syncMigrations.message));
        setSyncing(false); // Stop syncing flag on error
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error : new Error('Unknown error occurred'));
      setSyncing(false); // Stop syncing flag on error
      
      const logData: LogData = {
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      logger.error('Error syncing migrations:', logData);
    }
  };

  const handleCronUpdate = async () => {
    try {
      await updateCronConfig({
        variables: {
          enterpriseName: selectedEnterprise,
          schedule: cronSchedule,
          enabled: cronEnabled
        }
      });
    } catch (error) {
      console.error('Error updating cron config:', error);
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

        {/* Move Sync Progress here, right after the buttons */}
        {(syncing || syncProgress.length > 0) && (
          <div className="mb-6 border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              Sync Progress
            </h3>
            <div className="space-y-4">
              {syncProgress.map((progress) => (
                <SyncProgress
                  key={progress.organizationName}
                  {...progress}
                />
              ))}
            </div>
          </div>
        )}
        
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

      {/* Add Cron Configuration Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mt-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Automated Sync Configuration</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cron Schedule
            </label>
            <div className="mt-1">
              <input
                type="text"
                value={cronSchedule}
                onChange={(e) => setCronSchedule(e.target.value)}
                placeholder="0 0 * * *"
                className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-60 sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md font-mono"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Format: minute hour day month weekday (e.g., "0 0 * * *" for daily at midnight)
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="cronEnabled"
              checked={cronEnabled}
              onChange={(e) => setCronEnabled(e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="cronEnabled" className="ml-2 block text-sm text-gray-900 dark:text-gray-100">
              Enable automated sync
            </label>
          </div>

          {cronConfigData?.cronConfig && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {cronConfigData.cronConfig.lastRun && (
                <p>Last run: {new Date(cronConfigData.cronConfig.lastRun).toLocaleString()}</p>
              )}
              {cronConfigData.cronConfig.nextRun && (
                <p>Next run: {new Date(cronConfigData.cronConfig.nextRun).toLocaleString()}</p>
              )}
            </div>
          )}

          <div className="pt-4">
            <button
              onClick={handleCronUpdate}
              disabled={!selectedEnterprise || updatingCron}
              className={`px-4 py-2 rounded-md text-white ${
                selectedEnterprise
                  ? 'bg-primary-600 hover:bg-primary-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {updatingCron ? 'Updating Cron...' : 'Save Cron Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* Add Sync History Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mt-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Migration Sync History</h2>
          <button 
            onClick={() => refetchSyncHistories()} 
            className="px-3 py-1 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
        
        <div className="mt-4">
          <SyncHistoryTable 
            syncHistories={syncHistoriesData?.syncHistories || []}
            loading={syncHistoriesLoading}
            error={syncHistoriesError}
          />
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