import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

let pendingSwUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
let updateScheduledForNextNav = false;

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // Clean up any previously registered dev service worker so Vite HMR/reload never hits empty precache
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });
  } else {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Phase 23A: Never interrupt an active audio recording or session mid-work.
        // Queue activation silently for the next route transition or full navigation.
        pendingSwUpdate = updateSW;
        updateScheduledForNextNav = true;
        window.dispatchEvent(new CustomEvent('apex:pwa-update-ready'));
      },
      onOfflineReady() {
        // App shell and assigned scripts are cached via StaleWhileRevalidate for offline playback
      },
    });

    const applyPendingUpdateOnNextNav = () => {
      if (updateScheduledForNextNav && pendingSwUpdate) {
        updateScheduledForNextNav = false;
        void pendingSwUpdate(true);
      }
    };

    window.addEventListener('popstate', applyPendingUpdateOnNextNav);
  }
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { errorMessage: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      errorMessage: error instanceof Error ? error.message : 'Unexpected interface error',
    };
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFF] p-6 text-slate-900">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h1 className="text-lg font-bold tracking-tight">Unable to render view</h1>
            <p className="text-sm text-slate-600">{this.state.errorMessage}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[40px] rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', '/');
                  window.location.reload();
                }}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
