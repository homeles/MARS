import React from 'react';

interface MigrationStatusBadgeProps {
  status: string;
}

const MigrationStatusBadge: React.FC<MigrationStatusBadgeProps> = ({ status }) => {
  // Define styling based on status
  const getStatusClass = () => {
    switch (status) {
      case 'PENDING':
        return 'status-pending';
      case 'QUEUED':
        return 'status-queued';
      case 'IN_PROGRESS':
        return 'status-in-progress';
      case 'SUCCEEDED':
        return 'status-succeeded';
      case 'FAILED':
        return 'status-failed';
      default:
        return 'status-unknown';
    }
  };

  // Format display text
  const formatStatus = (status: string) => {
    return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusClass()}`}>
      {formatStatus(status)}
    </span>
  );
};

export default MigrationStatusBadge;