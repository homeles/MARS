import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import LoginForm from '../components/LoginForm';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [showLogin, setShowLogin] = React.useState(!isAuthenticated);

  if (!isAuthenticated) {
    return showLogin ? (
      <>
        {/* Render the protected component behind the login form */}
        <div className="pointer-events-none opacity-20">
          {children}
        </div>
        
        <LoginForm 
          onSuccess={() => setShowLogin(false)} 
          onCancel={() => {
            // Redirect to dashboard when cancel is clicked
            window.location.href = '/';
          }}
        />
      </>
    ) : (
      <Navigate to="/" state={{ from: location }} replace />
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
