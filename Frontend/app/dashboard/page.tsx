"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import { fetchCurrentUser, getToken, removeToken, type User } from "../lib/auth";

/** How often the dashboard re-fetches while the tab is visible. */
const REFRESH_INTERVAL_MS = 10_000;

type SortKey = "label" | "value";
type SortDirection = "asc" | "desc";

interface StatRow {
  label: string;
  value: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
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

  const rows: StatRow[] = user
    ? [
        { label: "Account", value: user.isActive ? "Active" : "Inactive" },
        { label: "Wallets", value: String(user.wallets?.length ?? 0) },
        { label: "Last wallet use", value: latestWalletUse(user) ?? "Never" },
      ]
    : [];

  const sortedRows = sortRows(rows, sortKey, sortDirection);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

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
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
                <tr>
                  <SortableHeader
                    label="Metric"
                    sortKey="label"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Value"
                    sortKey="value"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.label} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-4 text-white/70">{row.label}</td>
                    <td className="px-5 py-4 font-semibold">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function sortRows(rows: StatRow[], key: SortKey, direction: SortDirection): StatRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => a[key].localeCompare(b[key], undefined, { numeric: true }) * factor);
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  const ariaSort = isActive ? (direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className="px-5 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-white"
      >
        {label}
        <span aria-hidden="true">{isActive ? (direction === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function latestWalletUse(user: User): string | null {
  const times = (user.wallets ?? [])
    .map((w) => (w.lastUsed ? new Date(w.lastUsed).getTime() : 0))
    .filter((t) => t > 0);
  return times.length ? new Date(Math.max(...times)).toLocaleString() : null;
}
