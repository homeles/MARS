import React, { useState, useEffect } from 'react';
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

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const GET_MIGRATION_METRICS = gql`
  query GetMigrationMetrics($enterpriseName: String!) {
    allMigrations(
      pageSize: -1,  # Use -1 to indicate no limit
      page: 1,
      orderBy: { field: CREATED_AT, direction: DESC },
      enterpriseName: $enterpriseName
    ) {
      totalCount
      completedCount
      failedCount
      inProgressCount
      nodes {
        id
        state
        createdAt
        duration
        warningsCount
        organizationName
        repositoryName
      }
      pageInfo {
        totalPages
        currentPage
        hasNextPage
        hasPreviousPage
      }
    }
  }
`;

const Reporting: React.FC = () => {
  const [selectedEnterprise, setSelectedEnterprise] = useState<string>('');

  // Load enterprise from localStorage
  useEffect(() => {
    const savedEnterprise = localStorage.getItem('selectedEnterprise');
    if (savedEnterprise) {
      setSelectedEnterprise(savedEnterprise);
    } else {
      // Use the environment variable as fallback
      const envEnterprise = import.meta.env.VITE_GITHUB_ENTERPRISE_NAME;
      if (envEnterprise) {
        setSelectedEnterprise(envEnterprise);
        localStorage.setItem('selectedEnterprise', envEnterprise);
      }
    }
  }, []);

  const { data, loading, error } = useQuery(GET_MIGRATION_METRICS, {
    variables: {
      enterpriseName: selectedEnterprise
    },
    pollInterval: 30000, // Poll every 30 seconds
    skip: !selectedEnterprise
  });

  if (loading) return <div className="p-4">Loading metrics...</div>;
  if (error) return <div className="p-4 text-red-500">Error loading metrics: {error.message}</div>;

  const metrics = data?.allMigrations || {};

  // Calculate additional metrics
  const avgWarnings = metrics.nodes?.length > 0 
    ? metrics.nodes.reduce((acc: number, m: any) => acc + (m.warningsCount || 0), 0) / metrics.nodes.length 
    : 0;
    
  const avgDuration = metrics.completedCount > 0 
    ? metrics.nodes?.reduce((acc: number, m: any) => acc + (m.state === 'SUCCEEDED' ? (m.duration || 0) : 0), 0) / metrics.completedCount 
    : 0;
  
  // Prepare chart data
  const chartData = {
    labels: ['7 days ago', '6 days ago', '5 days ago', '4 days ago', '3 days ago', '2 days ago', 'Today'],
    datasets: [
      {
        label: 'Completed Migrations',
        data: [12, 19, 15, 25, 22, 30, metrics.completedCount || 0],
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
      {
        label: 'Failed Migrations',
        data: [2, 3, 1, 4, 2, 3, metrics.failedCount || 0],
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      }
    ],
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Migration Reports</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Migrations"
          value={metrics.totalCount || 0}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>}
        />
        <StatsCard
          title="Completed"
          value={metrics.completedCount || 0}
          trend={{
            value: 15,
            isPositive: true
          }}
        />
        <StatsCard
          title="Failed"
          value={metrics.failedCount || 0}
          trend={{
            value: metrics.failedCount > 0 ? Number(((metrics.failedCount / metrics.totalCount) * 100).toFixed(0)) : 0,
            isPositive: false
          }}
        />
        <StatsCard
          title="In Progress"
          value={metrics.inProgressCount || 0}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Average Warnings"
          value={avgWarnings.toFixed(1)}
        />
        <StatsCard
          title="Success Rate"
          value={`${Math.round((metrics.completedCount / metrics.totalCount) * 100)}%`}
          trend={{
            value: 5,
            isPositive: true
          }}
        />
        <StatsCard
          title="Avg Duration"
          value={`${Math.round(avgDuration / 1000 / 60)} min`}
        />
        <StatsCard
          title="Active Organizations"
          value={new Set(metrics.nodes?.map((m: any) => m.organizationName)).size || 0}
        />
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Migration Trends</h3>
        <div className="h-64">
          <Line data={chartData} options={{ 
            maintainAspectRatio: false,
            scales: {
              y: {
                grid: {
                  color: 'rgba(107, 114, 128, 0.2)',
                },
                ticks: {
                  color: 'rgb(107, 114, 128)',
                }
              },
              x: {
                grid: {
                  color: 'rgba(107, 114, 128, 0.2)',
                },
                ticks: {
                  color: 'rgb(107, 114, 128)',
                }
              }
            }
          }} />
        </div>
      </div>

      {/* Organization Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Organization Performance</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Organization
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Total Migrations
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Success Rate
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Avg Duration
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Avg Warnings
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
              {metrics.nodes && Object.entries(
                metrics.nodes.reduce((acc: any, m: any) => {
                  // Initialize org data if not exists
                  if (!acc[m.organizationName]) {
                    acc[m.organizationName] = {
                      total: 0,
                      completed: 0,
                      totalDuration: 0,
                      totalWarnings: 0,
                      succeededCount: 0
                    };
                  }

                  // Update counts for all migrations
                  acc[m.organizationName].total++;
                  
                  // Only update success metrics for completed migrations
                  if (m.state === 'SUCCEEDED') {
                    acc[m.organizationName].completed++;
                    acc[m.organizationName].succeededCount++;
                    if (m.duration) {
                      acc[m.organizationName].totalDuration += m.duration;
                    }
                  }

                  // Add warnings count
                  acc[m.organizationName].totalWarnings += m.warningsCount || 0;
                  
                  return acc;
                }, {})
              ).map(([org, stats]: [string, any]) => (
                <tr key={org} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {org}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {stats.total}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : '0'}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {stats.succeededCount > 0 ? `${Math.round((stats.totalDuration / stats.succeededCount) / 1000 / 60)} min` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {stats.total > 0 ? (stats.totalWarnings / stats.total).toFixed(1) : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reporting;
