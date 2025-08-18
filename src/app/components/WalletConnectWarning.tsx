'use client';

import { useEffect, useState } from 'react';

export default function WalletConnectWarning() {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_ID;
    if (!projectId || projectId === "YOUR_WALLET_CONNECT_PROJECT_ID") {
      setShowWarning(true);
    }
  }, []);

  if (!showWarning) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-500 text-black px-4 py-2 rounded-lg shadow-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          ⚠️ WalletConnect not configured
        </span>
        <button
          onClick={() => setShowWarning(false)}
          className="text-black hover:text-gray-700"
        >
          ×
        </button>
      </div>
      <p className="text-xs mt-1">
        Set NEXT_PUBLIC_WALLET_CONNECT_ID in your .env.local file
      </p>
    </div>
  );
}
