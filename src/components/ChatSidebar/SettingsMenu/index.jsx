import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import SettingsModal from '../../SettingsModal';
import UserAvatar from '../../UserAvatar';

const SettingsMenu = ({ currentUser, onLogout }) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowSettings(true)}
        className="w-full min-h-12 flex items-center gap-3 px-2 pt-2 pb-0 hover:bg-gray-800 rounded-xl transition-colors group"
        title="Settings"
      >
        {/* Avatar with online dot */}
        <div className="relative flex-shrink-0">
          <UserAvatar
            user={currentUser}
            alt={currentUser?.username}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-transparent group-hover:ring-gray-600 transition-all"
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full ring-2 ring-gray-900" />
        </div>

        {/* Username + label — hidden on small screens to avoid horizontal scroll */}
        <div className="hidden md:flex flex-1 min-w-0 flex-col text-left">
          <p className="text-sm font-semibold text-white truncate">{currentUser?.username}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Settings size={10} /> Settings
          </p>
        </div>

        <Settings size={15} className="hidden md:block text-gray-500 group-hover:text-gray-300 transition-colors flex-shrink-0" />
      </button>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onLogout={onLogout}
          initialTab="account"
        />
      )}
    </>
  );
};

export default SettingsMenu;
