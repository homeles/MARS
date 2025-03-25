import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Settings: React.FC = () => {
  const [enterpriseName, setEnterpriseName] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [syncState, setSyncState] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load saved settings from localStorage when component mounts
  useEffect(() => {
    const savedEnterpriseName = localStorage.getItem('enterpriseName');
    const savedToken = localStorage.getItem('githubToken');
    
    if (savedEnterpriseName) {
      setEnterpriseName(savedEnterpriseName);
    }
    
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (enterpriseName) {
      localStorage.setItem('enterpriseName', enterpriseName);
    }
    
    if (token) {
      localStorage.setItem('githubToken', token);
    }
  }, [enterpriseName, token]);

  // Handle form submission
  const handleSyncMigrations = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!enterpriseName || !token) {
      setSyncResult({
        success: false,
        message: 'Enterprise name and GitHub token are required'
      });
      return;
    }
    
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      // Use REST API for more detailed control and feedback
      const response = await axios.post('http://localhost:4000/api/migrations/sync', {
        enterpriseName,
        token,
        state: syncState
      });
      
      setSyncResult({
        success: true,
        message: `Successfully synced migrations: ${response.data.added} added, ${response.data.updated} updated`
      });
    } catch (error: any) {
      setSyncResult({
        success: false,
        message: `Error: ${error.response?.data?.error || error.message}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Settings</h1>
      
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">GitHub API Configuration</h2>
        
        <form onSubmit={handleSyncMigrations}>
          <div className="mb-4">
            <label htmlFor="enterpriseName" className="block text-sm font-medium text-gray-700 mb-1">
              Enterprise/Organization Name
            </label>
            <input
              id="enterpriseName"
              type="text"
              value={enterpriseName}
              onChange={(e) => setEnterpriseName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
              placeholder="your-enterprise"
            />
            <p className="mt-1 text-xs text-gray-500">
              The name of your GitHub Enterprise or Organization as it appears in URLs
            </p>
          </div>
          
          <div className="mb-4">
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
              GitHub Personal Access Token
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
              placeholder="ghp_•••••••••••••••••"
            />
            <p className="mt-1 text-xs text-gray-500">
              Token needs permissions: repo, read:org, and read:enterprise
            </p>
          </div>
          
          <div className="mb-6">
            <label htmlFor="syncState" className="block text-sm font-medium text-gray-700 mb-1">
              Sync Migrations with Status
            </label>
            <select
              id="syncState"
              value={syncState}
              onChange={(e) => setSyncState(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="QUEUED">Queued</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="SUCCEEDED">Succeeded</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          
          <div>
            <button
              type="submit"
              disabled={isSyncing}
              className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                isSyncing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
              }`}
            >
              {isSyncing ? 'Syncing...' : 'Sync Migrations from GitHub'}
            </button>
          </div>
        </form>
        
        {syncResult && (
          <div className={`mt-4 p-3 rounded-md ${syncResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={syncResult.success ? 'text-green-800' : 'text-red-800'}>
              {syncResult.message}
            </p>
          </div>
        )}
      </div>
      
      <div className="bg-white shadow rounded-lg p-6 mt-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Database Information</h2>
        <p className="text-gray-600">
          Migration data is stored in MongoDB. You can manage this database using MongoDB Compass
          or any other MongoDB client.
        </p>
        <p className="mt-2 text-gray-600">
          Connection URL: <code className="bg-gray-100 p-1 rounded">mongodb://localhost:27017/github-migrations</code>
        </p>
      </div>
    </div>
  );
};

export default Settings;