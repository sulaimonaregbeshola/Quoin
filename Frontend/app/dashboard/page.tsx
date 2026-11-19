"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import { fetchCurrentUser, getToken, removeToken, type User } from "../lib/auth";

/** How often the dashboard re-fetches while the tab is visible. */
const REFRESH_INTERVAL_MS = 10_000;

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    // Skip if a request is still running so slow responses never pile up.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const current = await fetchCurrentUser(token);
      setUser(current);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh data");
      // Keep the last good data on screen; only drop the session on 401-style failures.
      if (err instanceof Error && /\(401\)|unauthori[sz]ed/i.test(err.message)) {
        removeToken();
        setUser(null);
      }
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined) {
        timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
    };
  }, [refresh]);

  return (
    <main className="min-h-screen bg-[#02030a] px-4 py-12 text-white sm:px-6 lg:px-8">
      <Navbar />
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <span aria-live="polite">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : "Not yet updated"}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-full border border-white/20 px-3 py-1 text-white/80 hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-6 py-4 text-white/70">
            Loading dashboard…
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-red-300"
          >
            {error}
          </div>
        )}

        {!isLoading && !user && (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-6 py-8 text-white/70">
            Sign in from the Profile page to see live account data.
          </div>
        )}

        {user && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Account" value={user.isActive ? "Active" : "Inactive"} />
            <Stat label="Wallets" value={String(user.wallets?.length ?? 0)} />
            <Stat
              label="Last wallet use"
              value={latestWalletUse(user) ?? "Never"}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function latestWalletUse(user: User): string | null {
  const times = (user.wallets ?? [])
    .map((w) => (w.lastUsed ? new Date(w.lastUsed).getTime() : 0))
    .filter((t) => t > 0);
  return times.length ? new Date(Math.max(...times)).toLocaleString() : null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5">
      <p className="text-xs uppercase tracking-wider text-white/50">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
