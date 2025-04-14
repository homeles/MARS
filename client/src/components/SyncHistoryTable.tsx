import React from 'react';

// Basic structure for SyncHistoryTable component
interface SyncHistory {
  id: string;
  startTime: string;
  endTime?: string;
  status: string;
  enterpriseName: string;
  organizationsCount: number;
  migrationsCount: number;
  error?: string;
  // Additional properties used in rendering
  organizations?: Array<{name?: string; login?: string; totalMigrations?: number}>;
  organizationNames?: string[];
  migrations?: Array<any>;
  repositoryMigrations?: Array<any>;
  totalMigrations?: number;
}

interface SyncHistoryTableProps {
  syncHistories?: SyncHistory[];
  loading?: boolean;
  error?: any;
}

const SyncHistoryTable: React.FC<SyncHistoryTableProps> = ({ syncHistories = [], loading = false, error }) => {
  if (loading) {
    return <div className="text-center p-4 text-gray-600 dark:text-gray-300">Loading sync history...</div>;
  }

  if (error) {
    return <div className="text-center p-4 text-red-600 dark:text-red-400">Error loading sync history: {error.message}</div>;
  }

  if (syncHistories.length === 0) {
    return <div className="text-center p-4 text-gray-600 dark:text-gray-300">No synchronization history available.</div>;
  }

  // Helper function to safely format dates
  const formatDate = (dateString: string): string => {
    try {
      // Check if dateString is valid before creating a Date object
      if (!dateString || dateString.trim() === '') {
        return 'Not Available';
      }
      
      // Try to fix common date format issues
      let dateToFormat = dateString;
      
      // If it's a unix timestamp (number as string)
      if (/^\d+$/.test(dateString)) {
        dateToFormat = new Date(parseInt(dateString)).toISOString();
      }
      
      const date = new Date(dateToFormat);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn("Invalid date format received:", dateString);
        return 'Not Available';
      }
      
      // Format date in a more readable format
      const options: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      
      return date.toLocaleString(undefined, options);
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Not Available';
    }
  };

  // Helper function to calculate duration
  const calculateDuration = (startTime: string, endTime?: string): string => {
    try {
      // Try to handle unix timestamp
      let startToUse = startTime;
      let endToUse = endTime;
      
      // If it's a unix timestamp (number as string)
      if (startTime && /^\d+$/.test(startTime)) {
        startToUse = new Date(parseInt(startTime)).toISOString();
      }
      
      if (endTime && /^\d+$/.test(endTime)) {
        endToUse = new Date(parseInt(endTime)).toISOString();
      }
      
      if (!startToUse) return '0 min';
      
      const start = new Date(startToUse);
      if (isNaN(start.getTime())) return '0 min';
      
      // If no end time is provided or it's invalid, use current time
      const end = endToUse ? new Date(endToUse) : new Date();
      if (isNaN(end.getTime())) return '0 min';
      
      const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));
      
      // Format duration more nicely
      if (durationMinutes < 1) {
        return 'Less than a minute';
      } else if (durationMinutes === 1) {
        return '1 minute';
      } else if (durationMinutes < 60) {
        return `${durationMinutes} minutes`;
      } else {
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        
        if (minutes === 0) {
          return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
          const hourText = hours === 1 ? '1 hour' : `${hours} hours`;
          const minuteText = minutes === 1 ? '1 minute' : `${minutes} minutes`;
          return `${hourText}, ${minuteText}`;
        }
      }
    } catch (e) {
      console.error("Error calculating duration:", e);
      return '0 min';
    }
  };

  // Helper function to format organization names for display
  const formatOrganizationDisplay = (organizations: any[]): string => {
    if (!organizations || organizations.length === 0) return 'None';
    
    const orgNames = organizations.map(org => org.name || org.login);
    if (orgNames.length <= 3) return orgNames.join(', ');
    
    return `${orgNames.slice(0, 3).join(', ')} +${orgNames.length - 3} more`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
        <thead className="bg-gray-100 dark:bg-gray-700">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Date
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Enterprise
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Organizations
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Migrations
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Duration
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-600">
          {syncHistories.map((item: SyncHistory) => {
            // Get formatted org display and full org list for tooltip
            const orgDisplay = item.organizations && Array.isArray(item.organizations) ?
              formatOrganizationDisplay(item.organizations) :
              item.organizationNames && Array.isArray(item.organizationNames) ?
              formatOrganizationDisplay(item.organizationNames.map(name => ({ login: name }))) :
              item.organizationsCount > 0 ? `${item.organizationsCount} orgs` :
              item.status === 'in-progress' ? 'In progress' : 'None';

            const fullOrgList = item.organizations && Array.isArray(item.organizations) ?
              item.organizations.map(org => org.name || org.login).join('\n') :
              item.organizationNames && Array.isArray(item.organizationNames) ?
              item.organizationNames.join('\n') : '';

            return (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {formatDate(item.startTime)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {item.enterpriseName || 'N/A'}
                </td>
                <td 
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 cursor-help"
                  title={fullOrgList}
                >
                  {orgDisplay}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {/* Show the number of migrations that were synced */}
                  {(() => {
                    // According to the SyncHistory model, migrations data is stored within each organization
                    if (item.organizations && Array.isArray(item.organizations) && item.organizations.length > 0) {
                      // Calculate the sum of all totalMigrations across all organizations
                      const totalMigrations = item.organizations.reduce((sum, org) => 
                        sum + (org.totalMigrations || 0), 0);
                      
                      return totalMigrations > 0 ? totalMigrations : 'None';
                    } 
                    
                    // Fallback to other possible data sources
                    if (item.migrations && Array.isArray(item.migrations) && item.migrations.length > 0) {
                      return item.migrations.length;
                    } 
                    if (item.repositoryMigrations && Array.isArray(item.repositoryMigrations) && item.repositoryMigrations.length > 0) {
                      return item.repositoryMigrations.length;
                    }
                    if (typeof item.totalMigrations === 'number' && item.totalMigrations > 0) {
                      return item.totalMigrations;
                    }
                    if (typeof item.migrationsCount === 'number' && item.migrationsCount > 0) {
                      return item.migrationsCount;
                    }
                    
                    // For special states
                    if (item.status === 'in-progress') {
                      return 'In progress';
                    }
                    
                    // Default case - no migrations or data not available
                    return 'None';
                  })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${item.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' : 
                      item.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' : 
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'}`}>
                    {item.status || 'unknown'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {item.status === 'in-progress' ? 'In progress' : calculateDuration(item.startTime, item.endTime)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SyncHistoryTable;
