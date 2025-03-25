import React, { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Link } from 'react-router-dom';
import MigrationStatusBadge from '../components/MigrationStatusBadge';
import StatsCard from '../components/StatsCard';

// Define GraphQL query for fetching migrations
const GET_MIGRATIONS = gql`
  query GetAllMigrations($state: MigrationState, $limit: Int, $offset: Int, $sortField: String, $sortOrder: String) {
    allMigrations(state: $state, limit: $limit, offset: $offset, sortField: $sortField, sortOrder: $sortOrder) {
      id
      repositoryName
      createdAt
      state
      failureReason
      completedAt
      duration
      enterpriseName
    }
  }
`;

const Dashboard: React.FC = () => {
  const [filter, setFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<string>('desc');
  
  // Query migrations with optional filtering
  const { loading, error, data, refetch } = useQuery(GET_MIGRATIONS, {
    variables: {
      state: filter,
      limit: 50,
      offset: 0,
      sortField,
      sortOrder
    },
    pollInterval: 30000, // Poll every 30 seconds to get updates
  });

  const handleFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setFilter(value === 'ALL' ? null : value);
  };

  const handleSortChange = (field: string) => {
    if (field === sortField) {
      // Toggle sorting order if clicking the same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to descending order for new sort field
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Group migrations by state for stats
  const getMigrationStats = () => {
    if (!data?.allMigrations) return {};
    
    return data.allMigrations.reduce((acc: Record<string, number>, migration: any) => {
      const state = migration.state;
      if (!acc[state]) acc[state] = 0;
      acc[state]++;
      return acc;
    }, {});
  };

  const stats = getMigrationStats();
  
  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4 md:mb-0">Repository Migrations</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={filter || 'ALL'}
            onChange={handleFilterChange}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="ALL">All Migrations</option>
            <option value="PENDING">Pending</option>
            <option value="QUEUED">Queued</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
          </select>
          
          <button
            onClick={() => refetch()}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-md"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Migration Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatsCard title="Total" count={data?.allMigrations?.length || 0} colorClass="bg-gray-100" />
        <StatsCard title="Succeeded" count={stats['SUCCEEDED'] || 0} colorClass="bg-green-100" />
        <StatsCard title="Failed" count={stats['FAILED'] || 0} colorClass="bg-red-100" />
        <StatsCard title="In Progress" count={stats['IN_PROGRESS'] || 0} colorClass="bg-blue-100" />
        <StatsCard title="Pending/Queued" count={(stats['PENDING'] || 0) + (stats['QUEUED'] || 0)} colorClass="bg-yellow-100" />
      </div>

      {/* Migration Table */}
      <div className="bg-white shadow overflow-hidden rounded-lg">
        {loading ? (
          <div className="p-6 text-center">
            <p className="text-gray-500">Loading migrations...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-red-500">Error loading migrations: {error.message}</p>
          </div>
        ) : data?.allMigrations?.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-500">No migrations found. Try syncing from GitHub in Settings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSortChange('repositoryName')}
                  >
                    Repository
                    {sortField === 'repositoryName' && (
                      <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSortChange('state')}
                  >
                    Status
                    {sortField === 'state' && (
                      <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSortChange('createdAt')}
                  >
                    Requested
                    {sortField === 'createdAt' && (
                      <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSortChange('duration')}
                  >
                    Duration
                    {sortField === 'duration' && (
                      <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.allMigrations.map((migration: any) => (
                  <tr key={migration.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{migration.repositoryName}</div>
                      <div className="text-sm text-gray-500">{migration.enterpriseName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <MigrationStatusBadge status={migration.state} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(migration.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(migration.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {migration.duration || 'In progress'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link to={`/migrations/${migration.id}`} className="text-primary-600 hover:text-primary-900">
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;