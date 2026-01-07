// Metal Login Screen Component
import { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, Key } from 'lucide-react';

interface LoginScreenProps {
  hasExistingIdentity: boolean;
  onLogin: (password: string) => Promise<void>;
  onCreateIdentity: (displayName: string, password: string, apiKey: string) => Promise<void>;
  error?: string;
}

export function LoginScreen({ 
  hasExistingIdentity, 
  onLogin, 
  onCreateIdentity,
  error 
}: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'create'>(hasExistingIdentity ? 'login' : 'create');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);

    try {
      if (mode === 'create') {
        if (password !== confirmPassword) {
          setLocalError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setLocalError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }
        if (!displayName.trim()) {
          setLocalError('Display name is required');
          setLoading(false);
          return;
        }
        await onCreateIdentity(displayName.trim(), password, apiKey);
      } else {
        await onLogin(password);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Metal</h1>
          <p className="text-zinc-500 mt-2">Secure. Private. Decentralized.</p>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 shadow-xl">
          {/* Mode Toggle */}
          {!hasExistingIdentity && (
            <div className="flex mb-6 bg-zinc-800 rounded-lg p-1">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Unlock
              </button>
              <button
                onClick={() => setMode('create')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'create'
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Create Identity
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'create' && (
              <>
                {/* Display Name */}
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* API Key */}
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      Squid Cloud API Key
                    </div>
                  </label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="cb_your_api_key"
                    className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none font-mono text-sm"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Required for cloud sync. Get your key from SquidCloud.
                  </p>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {mode === 'create' ? 'Create Password' : 'Password'}
                </div>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-800 text-white px-4 py-3 pr-12 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            {mode === 'create' && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            )}

            {/* Error */}
            {displayError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                {displayError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'create' ? (
                    <>
                      <Shield className="w-5 h-5" />
                      Create Secure Identity
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Unlock
                    </>
                  )}
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-6 border-t border-zinc-800">
            <div className="flex items-start gap-3 text-xs text-zinc-500">
              <Shield className="w-4 h-4 mt-0.5 text-emerald-500" />
              <p>
                Your password is used to derive encryption keys locally. 
                It never leaves your device and cannot be recovered if forgotten.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-zinc-600 text-sm mt-6">
          End-to-end encrypted • Zero-logging • Decentralized
        </p>
      </div>
    </div>
  );
}

export default LoginScreen;
