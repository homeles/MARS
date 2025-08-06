import React, { createContext, useContext, useState, useEffect } from 'react';

type AuthContextType = {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Check if we have a stored auth token
    const storedAuth = sessionStorage.getItem('adminAuth');
    return storedAuth === 'true';
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Store authentication state in session storage
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.setItem('adminAuth', 'true');
    } else {
      sessionStorage.removeItem('adminAuth');
    }
  }, [isAuthenticated]);

  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      // Use the server API for authentication instead of client-side comparison
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsAuthenticated(true);
        setLoading(false);
        return true;
      } else {
        setError(data.message || 'Authentication failed');
        setLoading(false);
        return false;
      }
    } catch (err) {
      setError('Network error. Please try again later.');
      setLoading(false);
      return false;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
