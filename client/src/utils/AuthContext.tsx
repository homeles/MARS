import React, { createContext, useContext, useState, useEffect } from 'react';

type AuthContextType = {
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Check if we have a stored auth token
    const storedAuth = sessionStorage.getItem('adminAuth');
    return storedAuth === 'true';
  });

  // Store authentication state in session storage
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.setItem('adminAuth', 'true');
    } else {
      sessionStorage.removeItem('adminAuth');
    }
  }, [isAuthenticated]);

  const login = (username: string, password: string): boolean => {
    // Compare with environment variables
    const validUsername = import.meta.env.VITE_MARS_ADMIN;
    const validPassword = import.meta.env.VITE_MARS_PASSWORD;
    
    if (username === validUsername && password === validPassword) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
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
