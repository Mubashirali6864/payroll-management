import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  completeSetup: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Enforce session-only authentication:
    // Auth tokens live strictly in sessionStorage. When the tab or browser is closed,
    // the session is destroyed by the browser so opening a new tab requires fresh login.
    // Clean up any legacy localStorage tokens to ensure no persistent cross-tab auto-login.
    localStorage.removeItem('mohsin_payroll_token');
    localStorage.removeItem('mohsin_payroll_user');

    const storedToken = sessionStorage.getItem('mohsin_payroll_token');
    const storedUser = sessionStorage.getItem('mohsin_payroll_user');
    
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        logout();
      }
    }
    setIsLoading(false);

    const handleAuthExpired = () => {
      logout();
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    sessionStorage.setItem('mohsin_payroll_token', data.token);
    sessionStorage.setItem('mohsin_payroll_user', JSON.stringify(data.user));
    // Clear any persistent localStorage residue
    localStorage.removeItem('mohsin_payroll_token');
    localStorage.removeItem('mohsin_payroll_user');
  };

  const completeSetup = (user: User, token: string) => {
    setToken(token);
    setUser(user);
    sessionStorage.setItem('mohsin_payroll_token', token);
    sessionStorage.setItem('mohsin_payroll_user', JSON.stringify(user));
    localStorage.removeItem('mohsin_payroll_token');
    localStorage.removeItem('mohsin_payroll_user');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('mohsin_payroll_token');
    sessionStorage.removeItem('mohsin_payroll_user');
    localStorage.removeItem('mohsin_payroll_token');
    localStorage.removeItem('mohsin_payroll_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, completeSetup, logout, isAuthenticated: !!token, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Authenticated fetch wrapper
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = sessionStorage.getItem('mohsin_payroll_token') || localStorage.getItem('mohsin_payroll_token');
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Don't set Content-Type for FormData - browser sets it with boundary
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });

  // If unauthorized / token expired, emit event to log out
  if (response.status === 401 && token) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  return response;
}