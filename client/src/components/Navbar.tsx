import React from 'react';
import { Link } from 'react-router-dom';

const Navbar: React.FC = () => {
  return (
    <nav className="bg-white dark:bg-gray-800 shadow">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <div className="flex-shrink-0">
              <Link to="/" className="text-2xl font-bold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 transition">
                GHEC Migrations
              </Link>
            </div>
            <div className="flex items-center gap-6">
              <Link
                to="/"
                className="text-base font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white px-3 py-2 rounded-md transition"
              >
                Dashboard
              </Link>
              <Link
                to="/reporting"
                className="text-base font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white px-3 py-2 rounded-md transition"
              >
                Reports
              </Link>
              <Link
                to="/settings"
                className="text-base font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white px-3 py-2 rounded-md transition"
              >
                Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;