import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import MigrationDetails from './pages/MigrationDetails';
import NotFound from './pages/NotFound';
import Settings from './pages/Settings';
import Reporting from './pages/Reporting';
import ProtectedRoute from './components/ProtectedRoute';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/migrations/:id" element={<MigrationDetails />} />
          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />
          <Route path="/reporting" element={<Reporting />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;