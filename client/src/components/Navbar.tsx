import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaBars, FaTimes, FaChartBar } from 'react-icons/fa';
import { TelescopeIcon, FileIcon, GearIcon } from '@primer/octicons-react';

const Navbar: React.FC = () => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path
      ? 'text-white dark:text-white'
      : 'text-gray-500 dark:text-gray-500';

  return (
    <nav className="bg-white dark:bg-gray-800 shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-2">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link to="/" className="text-xl font-bold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 transition">
              <div className="flex flex-col items-start justify-center whitespace-nowrap">
                <div className="flex items-center text-lg font-bold text-gray-800 dark:text-gray-100">
                  <TelescopeIcon size={18} className="mr-2" />
                  <span style={{ color: '#E57300' }}>MARS</span>
                </div>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-1">
                  Migration Analysis & Reporting System
                </span>
              </div>
            </Link>
          </div>

          {/* Hamburger Menu */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none"
            >
              {isMenuOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
            </button>
          </div>

           <div
            className={`flex-1 md:flex md:items-center gap-6 ${
              isMenuOpen ? 'block' : 'hidden'
            } md:block overflow-x-auto`}
          >
            {/* Centered Links */}
            <div className="flex flex-wrap items-center justify-center flex-1 gap-4">
              <Link
                to="/"
                className={`text-base px-3 py-2 rounded-md flex items-center gap-2 transition whitespace-nowrap ${isActive(
                  '/'
                )}`}
              >
                <FaChartBar /> Dashboard
              </Link>
              <Link
                to="/reporting"
                className={`text-base px-3 py-2 rounded-md flex items-center gap-2 transition whitespace-nowrap ${isActive(
                  '/reporting'
                )}`}
              >
                <FileIcon size={16} /> Reports
              </Link>
            </div>
          
            {/* Right-Aligned Settings Link */}
            <div className="ml-auto">
              <Link
                to="/settings"
                className={`text-base px-3 py-2 rounded-md flex items-center gap-2 transition whitespace-nowrap ${isActive(
                  '/settings'
                )}`}
              >
                <GearIcon size={16} /> Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;