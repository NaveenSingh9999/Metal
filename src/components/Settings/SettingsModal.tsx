// Metal Settings Modal Component
import { useState } from 'react';
import { 
  X, 
  Shield, 
  Bell, 
  Moon, 
  Sun, 
  Volume2, 
  Clock, 
  Key, 
  Trash2,
  Download,
  Copy,
  Check,
  Hash
} from 'lucide-react';
import type { AppSettings } from '../../types';
import { formatMetalId } from '../../services/metal-id';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  publicKey: string;
  metalId?: string;
  onDeleteAccount: () => void;
  onExportData: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  publicKey,
  metalId,
  onDeleteAccount,
  onExportData
}: SettingsModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedMetalId, setCopiedMetalId] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen) return null;

  const copyPublicKey = async () => {
    await navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyMetalId = async () => {
    if (metalId) {
      await navigator.clipboard.writeText(metalId);
      setCopiedMetalId(true);
      setTimeout(() => setCopiedMetalId(false), 2000);
    }
  };

  const handleDeleteAccount = () => {
    if (showDeleteConfirm) {
      onDeleteAccount();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Identity */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Identity
            </h3>
            
            {/* Metal ID */}
            {metalId && (
              <div className="bg-zinc-800 rounded-lg p-3 mb-3">
                <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Your Metal ID
                </p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-2xl font-bold font-mono text-emerald-400 tracking-wider">
                    {formatMetalId(metalId)}
                  </span>
                  <button
                    onClick={copyMetalId}
                    className="p-2 hover:bg-zinc-700 rounded transition-colors"
                    title="Copy Metal ID"
                  >
                    {copiedMetalId ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-zinc-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Share this ID with others to let them add you as a contact
                </p>
              </div>
            )}
            
            {/* Public Key */}
            <div className="bg-zinc-800 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
                <Key className="w-3 h-3" />
                Your Public Key
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-emerald-400 font-mono truncate">
                  {publicKey}
                </code>
                <button
                  onClick={copyPublicKey}
                  className="p-2 hover:bg-zinc-700 rounded transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-zinc-400" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Appearance</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {settings.theme === 'dark' ? (
                    <Moon className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <Sun className="w-5 h-5 text-zinc-400" />
                  )}
                  <span className="text-white">Theme</span>
                </div>
                <select
                  value={settings.theme}
                  onChange={(e) => onUpdateSettings({ theme: e.target.value as AppSettings['theme'] })}
                  className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Notifications</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-zinc-400" />
                  <span className="text-white">Push Notifications</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(e) => onUpdateSettings({ notifications: e.target.checked })}
                  className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-zinc-400" />
                  <span className="text-white">Sound</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                  className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                />
              </label>
            </div>
          </div>

          {/* Security */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Security</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-zinc-400" />
                  <span className="text-white">Auto-lock</span>
                </div>
                <select
                  value={settings.autoLockTimeout}
                  onChange={(e) => onUpdateSettings({ autoLockTimeout: parseInt(e.target.value) })}
                  className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="0">Never</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-zinc-400" />
                  <span className="text-white">Message Expiry</span>
                </div>
                <select
                  value={settings.messageExpiry}
                  onChange={(e) => onUpdateSettings({ messageExpiry: parseInt(e.target.value) })}
                  className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="0">Never</option>
                  <option value="24">24 hours</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                </select>
              </div>
            </div>
          </div>

          {/* Data */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Data</h3>
            <div className="space-y-3">
              <button
                onClick={onExportData}
                className="w-full flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-white"
              >
                <Download className="w-5 h-5 text-zinc-400" />
                Export Data
              </button>

              <button
                onClick={handleDeleteAccount}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  showDeleteConfirm
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-red-400'
                }`}
              >
                <Trash2 className="w-5 h-5" />
                {showDeleteConfirm ? 'Click again to confirm' : 'Delete Account'}
              </button>
              {showDeleteConfirm && (
                <p className="text-xs text-red-400 text-center">
                  This will permanently delete all your data!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
