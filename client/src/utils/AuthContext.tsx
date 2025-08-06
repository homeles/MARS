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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(() => {
    // Check if we have a stored JWT token
    return sessionStorage.getItem('authToken');
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, verify token with server if present
  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        setLoading(true);
        try {
          const response = await fetch('/api/verify-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ token }),
          });
          const data = await response.json();
          if (data.valid) {
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
            setToken(null);
            sessionStorage.removeItem('authToken');
          }
        } catch (err) {
          setIsAuthenticated(false);
          setToken(null);
          sessionStorage.removeItem('authToken');
        } finally {
          setLoading(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    };
    verifyToken();
  }, [token]);

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
