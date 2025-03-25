import React from 'react';

interface StatsCardProps {
  title: string;
  count: number;
  colorClass?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, count, colorClass = 'bg-blue-100' }) => {
  return (
    <div className={`${colorClass} shadow-card rounded-lg p-4`}>
      <h3 className="text-lg font-medium text-gray-800">{title}</h3>
      <p className="text-3xl font-bold mt-1">{count}</p>
    </div>
  );
};

export default StatsCard;