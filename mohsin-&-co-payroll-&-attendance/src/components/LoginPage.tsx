import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, completeSetup, isLoading: authLoading } = useAuth();
  
  // Setup detection
  const [isSetupRequired, setIsSetupRequired] = useState<boolean | null>(null);
  const [checkingSetup, setCheckingSetup] = useState(true);

  // Login form state (clean, no pre-filled credentials)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Setup form state
  const [setupName, setSetupName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(res => res.json())
      .then(data => {
        setIsSetupRequired(!!data.setupRequired);
      })
      .catch(() => {
        setIsSetupRequired(false);
      })
      .finally(() => {
        setCheckingSetup(false);
      });
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (setupPassword !== setupConfirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (setupPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setupName,
          email: setupEmail,
          password: setupPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete initial administrator setup');
      }

      completeSetup(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Setup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || checkingSetup) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  // FIRST RUN SETUP VIEW
  if (isSetupRequired) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="font-black text-2xl md:text-3xl tracking-tight text-gray-900 font-heading">
              Mohsin & Co.
            </h1>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Initial System Setup
            </div>
            <p className="text-gray-500 text-sm mt-2">
              Create the primary administrator account to secure your system.
            </p>
          </div>

          <form onSubmit={handleSetupSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block font-semibold text-gray-700 text-sm mb-1">Administrator Name</label>
              <input
                type="text"
                required
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-blue-600"
                placeholder="e.g. System Administrator"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 text-sm mb-1">Work Email</label>
              <input
                type="email"
                required
                value={setupEmail}
                onChange={(e) => setSetupEmail(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-blue-600"
                placeholder="admin@company.com"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 text-sm mb-1">Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-blue-600"
                placeholder="Create strong password"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 text-sm mb-1">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={setupConfirmPassword}
                onChange={(e) => setSetupConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:border-blue-600"
                placeholder="Repeat password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 mt-2 rounded-lg font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Configuring System...' : 'Create Admin & Launch'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // STANDARD LOGIN VIEW (CLEAN, NO DEMO CREDENTIALS)
  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="font-black text-2xl md:text-3xl tracking-tight text-gray-900 font-heading">
            Mohsin & Co.
          </h1>
          <p className="text-gray-500 mt-2">Payroll & Attendance System</p>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-5" autoComplete="off">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}