import React from 'react';

interface SyncProgressProps {
  organizationName: string;
  totalPages: number;
  currentPage: number;
  migrationsCount: number;
  isCompleted: boolean;
  error?: string;
  estimatedTimeRemainingMs?: number;
  elapsedTimeMs?: number;
  processingRate?: number; // migrations per second
}

const formatTime = (ms: number): string => {
  if (ms < 0) return '00:00';
  
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

const SyncProgress: React.FC<SyncProgressProps> = ({
  organizationName,
  totalPages,
  currentPage,
  migrationsCount,
  isCompleted,
  error,
  estimatedTimeRemainingMs,
  elapsedTimeMs,
  processingRate
}) => {
  // Calculate percentage complete - handle edge cases better
  const percentComplete = (totalPages > 0 && currentPage > 0)
    ? Math.min(Math.round((currentPage / totalPages) * 100), 100) 
    : (isCompleted ? 100 : 0);
  
  // Status text color based on state
  const statusTextColor = error 
    ? 'text-red-500 dark:text-red-400' 
    : isCompleted 
      ? 'text-green-500 dark:text-green-400'
      : 'text-blue-500 dark:text-blue-400';
  
  // Progress bar color based on state
  const progressBarColor = error 
    ? 'bg-red-500 dark:bg-red-600' 
    : isCompleted 
      ? 'bg-green-500 dark:bg-green-600'
      : 'bg-blue-500 dark:bg-blue-600';
  
  // Determine the width of the progress bar
  const progressBarWidth = isCompleted ? '100%' : `${percentComplete}%`;

  return (
    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg shadow">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {organizationName}
          </span>
          {(!isCompleted && !error) && (
            <span className="ml-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          )}
        </div>
        <span className={`text-xs font-semibold ${statusTextColor}`}>
          {isCompleted ? 'Completed' : error ? 'Error' : 'In Progress'}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="relative w-full h-4 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
        <div 
          className={`absolute left-0 top-0 h-full ${progressBarColor} transition-width duration-500 ease-in-out`}
          style={{ width: progressBarWidth }}
        ></div>
        
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-gray-800 dark:text-white z-10">
            {percentComplete}%
          </span>
        </div>
      </div>
      
      {/* Status Details */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
        <div>
          <span className="font-medium">Pages:</span> {currentPage}{totalPages ? `/${totalPages}` : ''}
        </div>
        <div>
          <span className="font-medium">Migrations:</span> {migrationsCount}
        </div>
        
        {processingRate !== undefined && (
          <div>
            <span className="font-medium">Rate:</span> {processingRate.toFixed(1)}/sec
          </div>
        )}
        
        {elapsedTimeMs !== undefined && (
          <div>
            <span className="font-medium">Elapsed:</span> {formatTime(elapsedTimeMs)}
          </div>
        )}
        
        {estimatedTimeRemainingMs !== undefined && !isCompleted && !error && (
          <div className="col-span-2">
            <span className="font-medium">Est. remaining:</span> {formatTime(estimatedTimeRemainingMs)}
          </div>
        )}
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-600 dark:text-red-300 font-medium">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default SyncProgress;