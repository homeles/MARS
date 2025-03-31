import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import StatsCard from '../components/StatsCard';
import MigrationStatusBadge from '../components/MigrationStatusBadge';
import { MigrationState, Migration } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const GET_MIGRATIONS = gql`
  query GetMigrations($state: MigrationState, $enterpriseName: String, $organizationName: String) {
    allMigrations(
      state: $state
      enterpriseName: $enterpriseName
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
        completedAt
        organizationName
        targetOrganizationName
        duration
        enterpriseName
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

const Dashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedStatus, setSelectedStatus] = useState<MigrationState | ''>(
    (searchParams.get('status') as MigrationState) || ''
  );
  const [selectedOrg, setSelectedOrg] = useState(searchParams.get('org') || '');
  const [allOrganizations, setAllOrganizations] = useState<string[]>([]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedStatus('');
    setSelectedOrg('');
    setSearchParams({}, { replace: true });
  };

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedStatus) params.set('status', selectedStatus);
    if (selectedOrg) params.set('org', selectedOrg);
    setSearchParams(params, { replace: true });
  }, [searchQuery, selectedStatus, selectedOrg, setSearchParams]);

  const { data, loading, error } = useQuery(GET_MIGRATIONS, {
    variables: { 
      state: selectedStatus || undefined,
      organizationName: selectedOrg || undefined 
    },
    onCompleted: (data) => {
      // Update allOrganizations when data is loaded
      const orgs = Array.from(new Set(data.allMigrations.nodes.map((m: Migration) => m.organizationName)));
      setAllOrganizations(prev => {
        const combined = Array.from(new Set([...prev, ...orgs]));
        return combined.sort() as string[];
      });
    }
  });

  const migrations: Migration[] = data?.allMigrations.nodes || [];
  const filteredMigrations = migrations.filter(migration =>
    migration.repositoryName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const calculateStats = (migrations: Migration[]) => {
    const stats = {
      total: migrations.length,
      succeeded: migrations.filter((m: Migration) => m.state === MigrationState.SUCCEEDED).length,
      failed: migrations.filter((m: Migration) => m.state === MigrationState.FAILED).length,
      inProgress: migrations.filter((m: Migration) => m.state === MigrationState.IN_PROGRESS).length,
    };
    return stats;
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
                xmlns="http://www.w3.org/2000/svg"
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
          {new Date(migration.createdAt).toLocaleDateString()}
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

  const stats = calculateStats(migrations);

  // Prepare chart data
  const chartData = {
    labels: ['7 days ago', '6 days ago', '5 days ago', '4 days ago', '3 days ago', '2 days ago', 'Today'],
    datasets: [
      {
        label: 'Completed Migrations',
        data: [12, 19, 15, 25, 22, 30, stats.succeeded], // Example data
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
          title="In Progress"
          value={stats.inProgress}
        />
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card p-6 mb-8">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Migration Trends</h3>
        <div className="h-64">
          <Line data={chartData} options={{ 
            maintainAspectRatio: false,
            color: 'rgb(209, 213, 219)', // gray-300 for better visibility in dark mode
            scales: {
              y: {
                grid: {
                  color: 'rgba(107, 114, 128, 0.2)', // gray-500 with opacity
                },
                ticks: {
                  color: 'rgb(107, 114, 128)', // gray-500
                }
              },
              x: {
                grid: {
                  color: 'rgba(107, 114, 128, 0.2)', // gray-500 with opacity
                },
                ticks: {
                  color: 'rgb(107, 114, 128)', // gray-500
                }
              }
            }
          }} />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as MigrationState | '')}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          {(Object.values(MigrationState) as MigrationState[]).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <select
          value={selectedOrg}
          onChange={(e) => setSelectedOrg(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">All Organizations</option>
          {allOrganizations.map(org => (
            <option key={org} value={org}>{org}</option>
          ))}
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
              xmlns="http://www.w3.org/2000/svg"
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Repository
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  GitHub
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Warnings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Failure Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
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
              ) : filteredMigrations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No migrations found
                  </td>
                </tr>
              ) : (
                filteredMigrations.map((m: Migration) => renderRow(m))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;