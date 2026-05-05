"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

export type DbSummary = {
  id: string;
  name: string;
  description: string | null;
  adCount: number;
};

type DbContextValue = {
  databases: DbSummary[];
  activeDb: DbSummary | null;
  setActiveDbId: (id: string) => void;
  refreshDatabases: () => Promise<void>;
  loading: boolean;
};

const DbContext = createContext<DbContextValue>({
  databases: [],
  activeDb: null,
  setActiveDbId: () => {},
  refreshDatabases: async () => {},
  loading: true,
});

const LS_KEY = "adIntel_activeDbId";

export function DbProvider({ children }: { children: ReactNode }) {
  const [databases, setDatabases] = useState<DbSummary[]>([]);
  const [activeDbId, setActiveDbIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDatabases = useCallback(async () => {
    try {
      const res = await fetch("/api/databases");
      const data: DbSummary[] = await res.json();
      setDatabases(data);

      // Restore saved active DB, or default to first
      const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
      const valid = saved && data.find((d) => d.id === saved);
      const target = valid ? saved : data[0]?.id ?? null;
      setActiveDbIdState(target);
    } catch (e) {
      console.error("Failed to load databases", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  const setActiveDbId = useCallback((id: string) => {
    setActiveDbIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, id);
  }, []);

  const activeDb = databases.find((d) => d.id === activeDbId) ?? databases[0] ?? null;

  return (
    <DbContext.Provider value={{ databases, activeDb, setActiveDbId, refreshDatabases: fetchDatabases, loading }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDb() {
  return useContext(DbContext);
}
