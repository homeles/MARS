import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import StatsCard from '../components/StatsCard';
import MigrationStatusBadge from '../components/MigrationStatusBadge';
import { MigrationState, Migration } from '../types';
import { logger } from '../utils/logger';
import debounce from 'lodash.debounce';

// Get organizations query
const GET_ORGANIZATIONS = gql`
  query GetOrganizations($enterprise: String!) {
    enterprise(slug: $enterprise) {
      organizations(first: 100) {
        nodes {
          login
        }
      }
    }
  }
`;

// Main migrations query
const GET_MIGRATIONS = gql`
  query GetMigrations($state: MigrationState, $pageSize: Int, $page: Int, $orderBy: MigrationOrder, $search: String, $organizationName: String) {
    allMigrations(
      state: $state,
      pageSize: $pageSize,
      page: $page,
      orderBy: $orderBy,
      search: $search,
      organizationName: $organizationName
    ) {
      nodes {
        id
        githubId
        repositoryName
        createdAt
        state
        warningsCount
        failureReason
        organizationName
        enterpriseName
        migrationSource {
          id
          name
          type
          url
        }
      }
      pageInfo {
        hasPreviousPage
        hasNextPage
        totalPages
        currentPage
      }
      totalCount
      completedCount
      failedCount
      inProgressCount
      queuedMigrations
    }
  }
`;

export const Dashboard: React.FC = () => {
  // Retrieve stored filters from localStorage
  const getStoredFilters = () => {
    try {
      const storedFilters = localStorage.getItem('dashboard_filters');
      return storedFilters ? JSON.parse(storedFilters) : null;
    } catch (error) {
      logger.error('Error parsing stored filters', { error });
      return null;
    }
  };
  
  // Initialize state with values from localStorage or defaults
  const storedFilters = getStoredFilters();
  const [searchQuery, setSearchQuery] = useState(storedFilters?.searchQuery || '');
  const [selectedStatus, setSelectedStatus] = useState<MigrationState | ''>(storedFilters?.selectedStatus || '');
  const [selectedOrg, setSelectedOrg] = useState(storedFilters?.selectedOrg || '');
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageSize, setPageSize] = useState<number>(storedFilters?.pageSize || 30);
  const [currentPage, setCurrentPage] = useState(storedFilters?.currentPage || 1);
  
  // Add debounced search query
  const [debouncedSearch] = useState(() => 
    debounce((query: string) => {
      setCurrentPage(1); // Reset to first page when searching
      refetch({
        search: query || undefined,
        page: 1
      });
      // Save the updated search to localStorage
      saveFiltersToLocalStorage({ ...getStoredFilters(), searchQuery: query, currentPage: 1 });
    }, 300)
  );
  
  // Function to save filters to localStorage
  const saveFiltersToLocalStorage = (filters: any) => {
    try {
      localStorage.setItem('dashboard_filters', JSON.stringify(filters));
    } catch (error) {
      logger.error('Error saving filters to localStorage', { error });
    }
  };

  // Fetch organizations for the dropdown
  const { data: organizationsData } = useQuery(GET_ORGANIZATIONS, {
    variables: { enterprise: import.meta.env.VITE_GITHUB_ENTERPRISE_NAME || '' }
  });
  const organizations = organizationsData?.enterprise?.organizations?.nodes?.map((node: { login: string }) => node.login) || [];

  // Add sort state management with localStorage persistence
  const [sortField, setSortField] = useState<'CREATED_AT' | 'REPOSITORY_NAME' | 'ORGANIZATION_NAME' | 'STATE' | 'WARNINGS_COUNT' | 'DURATION'>(
    storedFilters?.sortField || 'CREATED_AT'
  );
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>(
    storedFilters?.sortDirection || 'DESC'
  );

  const clearAllFilters = () => {
    // Clear state
    setSearchQuery('');
    setSelectedStatus('');
    setSelectedOrg('');
    setCurrentPage(1);
    
    // Clear localStorage
    localStorage.removeItem('dashboard_filters');
    
    // Refetch with cleared filters
    refetch({
      search: undefined,
      state: undefined,
      organizationName: undefined,
      page: 1
    });
  };

  const handleSort = (field: typeof sortField) => {
    let newDirection: 'ASC' | 'DESC';
    
    if (field === sortField) {
      // If clicking the same field, toggle direction
      newDirection = sortDirection === 'ASC' ? 'DESC' : 'ASC';
      setSortDirection(newDirection);
    } else {
      // If clicking a new field, set it with DESC direction
      setSortField(field);
      newDirection = 'DESC';
      setSortDirection(newDirection);
    }
    
    // Save updated sort preferences to localStorage
    const currentFilters = getStoredFilters() || {};
    saveFiltersToLocalStorage({
      ...currentFilters,
      sortField: field,
      sortDirection: newDirection
    });
  };

  // Update useQuery variables to include current sort
  const { data, loading, error, refetch } = useQuery(GET_MIGRATIONS, {
    variables: { 
      state: selectedStatus || undefined,
      organizationName: selectedOrg || undefined,
      pageSize,
      page: currentPage,
      orderBy: {
        field: sortField,
        direction: sortDirection
      },
      search: searchQuery || undefined
    },
    fetchPolicy: 'cache-and-network', // Change this to fetch from network and update cache
    nextFetchPolicy: 'cache-first' // Use cache for subsequent requests until variables change
  });

  // Handle search input changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    debouncedSearch(value);
    // Note: We don't need to save here because debouncedSearch already saves to localStorage
  };

  const migrations = data?.allMigrations?.nodes || [];
  const pageInfo = data?.allMigrations?.pageInfo;
  const totalCount = data?.allMigrations?.totalCount || 0;
  const totalPages = pageInfo?.totalPages || Math.ceil(totalCount / pageSize);
  
  const stats = {
    total: data?.allMigrations?.totalCount || 0,
    succeeded: data?.allMigrations?.completedCount || 0,
    failed: data?.allMigrations?.failedCount || 0,
    inProgress: data?.allMigrations?.inProgressCount || 0,
    queued: data?.allMigrations?.queuedMigrations || 0
  };

  const renderRow = (migration: Migration) => {
    const repoUrl = `https://github.com/${migration.organizationName}/${migration.repositoryName}`;
    const isSuccessful = migration.state === MigrationState.SUCCEEDED;
    const truncatedRepoName = migration.repositoryName.length > 25 
      ? `${migration.repositoryName.substring(0, 25)}...` 
      : migration.repositoryName;
    
    return (
      <tr key={migration.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
          <Link 
            to={`/migrations/${migration.id}`}
            className="hover:text-primary-600 dark:hover:text-primary-400"
            title={migration.repositoryName}
          >
            {truncatedRepoName}
          </Link>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
          {migration.organizationName}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <MigrationStatusBadge status={migration.state} />
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-center">
          {isSuccessful ? (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
              title="Open in GitHub"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/200/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          ) : (
            <span className="text-gray-400 dark:text-gray-600" title="Repository not yet available">
              -
            </span>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
          {migration.createdAt ? new Date(migration.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
          {migration.warningsCount || 0}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
          {migration.duration ? `${Math.round(migration.duration / 1000 / 60)} mins` : '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500 dark:text-red-400 truncate max-w-xs">
          {migration.failureReason || '-'}
        </td>
      </tr>
    );
  };

  // Clear pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, selectedOrg, pageSize]);

  const PaginationButton: React.FC<{
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
    children: React.ReactNode;
  }> = ({ onClick, disabled, active, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 text-sm rounded-md ${
        disabled
          ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          : active
          ? 'bg-primary-600 text-white'
          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      } border border-gray-300 dark:border-gray-600`}
    >
      {children}
    </button>
  );

  const generatePageNumbers = (currentPage: number, totalPages: number) => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    range.push(1);

    for (let i = currentPage - delta; i <= currentPage + delta; i++) {
      if (i < totalPages && i > 1) {
        range.push(i);
      }
    }

    range.push(totalPages);

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  const goToPage = async (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage || loadingMore) return;
    
    setLoadingMore(true);
    try {
      setCurrentPage(page);
      
      // Save the current page to localStorage
      const currentFilters = getStoredFilters() || {};
      saveFiltersToLocalStorage({
        ...currentFilters,
        currentPage: page
      });
      
      await refetch({
        page,
        pageSize,
        state: selectedStatus || undefined,
        organizationName: selectedOrg || undefined,
        orderBy: {
          field: sortField,
          direction: sortDirection
        },
        search: searchQuery || undefined
      });
    } catch (error) {
      logger.error('Error navigating to page', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const SortableHeader: React.FC<{ 
    field: typeof sortField;
    title: string;
    className?: string;
  }> = ({ field, title, className = '' }) => {
    const isCurrentSort = sortField === field;
    const sortIcon = isCurrentSort ? (
      sortDirection === 'ASC' ? '↑' : '↓'
    ) : '↕';

    return (
      <th 
        className={`${className} cursor-pointer group`}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center space-x-1">
          <span>{title}</span>
          <span className={`${isCurrentSort ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
            {sortIcon}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6; space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Migration Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <StatsCard
          title="Total Migrations"
          value={stats.total}
          icon={<svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>}
        />
        <StatsCard
          title="Successful Migrations"
          value={stats.succeeded}
          trend={{ value: 12, isPositive: true }}
        />
        <StatsCard
          title="Failed Migrations"
          value={stats.failed}
        />
        <StatsCard
          title="Queued"
          value={stats.queued}
          icon={<svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>}
        />
        <StatsCard
          title="In Progress"
          value={stats.inProgress}
        />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={selectedStatus}
          onChange={(e) => {
            const value = e.target.value as MigrationState | '';
            setSelectedStatus(value);
            // Save status filter to localStorage
            const currentFilters = getStoredFilters() || {};
            saveFiltersToLocalStorage({
              ...currentFilters,
              selectedStatus: value,
              currentPage: 1  // Reset to first page when filtering
            });
          }}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          {(Object.values(MigrationState) as MigrationState[]).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <select
          value={selectedOrg}
          onChange={(e) => {
            const value = e.target.value;
            setSelectedOrg(value);
            // Save org filter to localStorage
            const currentFilters = getStoredFilters() || {};
            saveFiltersToLocalStorage({
              ...currentFilters,
              selectedOrg: value,
              currentPage: 1  // Reset to first page when filtering
            });
          }}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">All Organizations</option>
          {organizations.map((org: string) => (
            <option key={org} value={org}>{org}</option>
          ))}
        </select>
        <select
          value={pageSize}
          onChange={(e) => {
            const value = Number(e.target.value);
            setPageSize(value);
            // Save page size to localStorage
            const currentFilters = getStoredFilters() || {};
            saveFiltersToLocalStorage({
              ...currentFilters,
              pageSize: value,
              currentPage: 1  // Reset to first page when changing page size
            });
          }}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value={10}>10 per page</option>
          <option value={30}>30 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
        {(searchQuery || selectedStatus || selectedOrg) && (
          <button
            onClick={clearAllFilters}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2"
            title="Clear all filters"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/200/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Clear Filters
          </button>
        )}
      </div>

      {/* Migrations Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <SortableHeader
                  field="REPOSITORY_NAME"
                  title="Repository"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                />
                <SortableHeader
                  field="ORGANIZATION_NAME"
                  title="Organization"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                />
                <SortableHeader
                  field="STATE"
                  title="Status"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                />
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  GitHub
                </th>
                <SortableHeader
                  field="CREATED_AT"
                  title="Created"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                />
                <SortableHeader
                  field="WARNINGS_COUNT"
                  title="Warnings"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                />
                <SortableHeader
                  field="DURATION"
                  title="Duration"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                />
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Failure Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading && !loadingMore ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-red-500 dark:text-red-400">
                    Error loading migrations
                  </td>
                </tr>
              ) : migrations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No migrations found
                  </td>
                </tr>
              ) : (
                <>
                  {migrations.map((m: Migration) => renderRow(m))}
                  {loadingMore && (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                        Loading more...
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="flex items-center space-x-2">
              <PaginationButton
                onClick={() => goToPage(1)}
                disabled={currentPage === 1 || loadingMore}
              >
                ««
              </PaginationButton>
              <PaginationButton
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loadingMore}
              >
                «
              </PaginationButton>
              
              {generatePageNumbers(currentPage, totalPages).map((pageNum, idx) => (
                <React.Fragment key={idx}>
                  {pageNum === '...' ? (
                    <span className="px-3 py-2 text-gray-500 dark:text-gray-400">...</span>
                  ) : (
                    <PaginationButton
                      onClick={() => goToPage(Number(pageNum))}
                      active={currentPage === pageNum}
                      disabled={loadingMore}
                    >
                      {pageNum}
                    </PaginationButton>
                  )}
                </React.Fragment>
              ))}
              
              <PaginationButton
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages || loadingMore || !pageInfo?.hasNextPage}
              >
                »
              </PaginationButton>
              <PaginationButton
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages || loadingMore || !pageInfo?.hasNextPage}
              >
                »»
              </PaginationButton>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Showing {migrations.length} of {totalCount} migrations (Page {currentPage} of {totalPages})
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;