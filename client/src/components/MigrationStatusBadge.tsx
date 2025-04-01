import React from 'react';

const getStatusStyles = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'pending_validation':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100';
    case 'succeeded':
      return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100';
    case 'failed':
    case 'failed_validation':
      return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100';
    case 'queued':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100';
    case 'not_started':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';
  }
};

const MigrationStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusStyles(status)}`}>
      {status.replace('_', ' ').charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </span>
  );
};

export default MigrationStatusBadge;