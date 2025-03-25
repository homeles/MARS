import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <h1 className="text-3xl font-semibold text-gray-800 dark:text-gray-100 mb-4">404 - Page Not Found</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-6">The page you are looking for does not exist.</p>
      <Link to="/" className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md">
        Return to Dashboard
      </Link>
    </div>
  );
};

export default NotFound;