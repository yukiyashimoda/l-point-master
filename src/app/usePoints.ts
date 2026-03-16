"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Staff = {
  id: string;
  name: string;
};

export type CategoryType =
  | "douhan"
  | "honshimei"
  | "free"
  | "bottle"
  | "yoyaku"
  | "shokai"
  | "annivWork"
  | "annivGuests";

export type BaseRecord = {
  id: string;
  date: string;
  staffId: string;
  category: CategoryType;
  label: string;
  points: number;
  meta?: Record<string, unknown>;
};

export type AppData = {
  staffList: Staff[];
  records: BaseRecord[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "point-contest-data-v1";

export const defaultStaff: Staff[] = [
  { id: "mei", name: "めい" },
  { id: "marin", name: "まりん" },
  { id: "yuuna", name: "ゆうな" },
  { id: "karin", name: "かりん" },
  { id: "himari", name: "ひまり" },
  { id: "sumire", name: "菫" },
  { id: "kawamura-ayumi", name: "川村あゆみ" },
  { id: "miiko", name: "みいこ" },
  { id: "rara", name: "らら" },
  { id: "mikoto", name: "美琴" },
  { id: "miri", name: "みり" },
  { id: "hikari", name: "ひかり" },
  { id: "marika", name: "まりか" },
  { id: "ayana", name: "あやな" },
  { id: "yuki", name: "ゆき" },
  { id: "karen", name: "かれん" },
  { id: "mana", name: "まな" },
  { id: "anri", name: "あんり" },
  { id: "sana", name: "さな" },
  { id: "saki", name: "さき" },
  { id: "runa", name: "るな" },
  { id: "natsuki", name: "なつき" },
  { id: "riko", name: "りこ" },
  { id: "mina", name: "みな" },
  { id: "nanami", name: "ななみ" },
  { id: "aika", name: "あいか" },
  { id: "aina", name: "あいな" },
  { id: "kurumi", name: "くるみ" },
  { id: "nozomi", name: "のぞみ" },
];

// ─── Storage adapter ──────────────────────────────────────────────────────────
// バックエンドを切り替える場合はこのオブジェクトだけ差し替えてください。

const storage = {
  async load(): Promise<AppData> {
    try {
      const res = await fetch("/api/data");
      if (!res.ok) return { staffList: defaultStaff, records: [] };
      const data = await res.json();
      if (!data) return { staffList: defaultStaff, records: [] };
      return data as AppData;
    } catch {
      return { staffList: defaultStaff, records: [] };
    }
  },
  save(data: AppData): void {
    fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
  },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePoints() {
  const [data, setData] = useState<AppData>({ staffList: defaultStaff, records: [] });
  const isFirstRender = useRef(true);

  // Load from storage after hydration
  useEffect(() => {
    storage.load().then(setData);
  }, []);

  // Persist on every change after initial load
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    storage.save(data);
  }, [data]);

  const staffList = data.staffList.length > 0 ? data.staffList : defaultStaff;

  function addRecords(recs: Omit<BaseRecord, "id">[]) {
    setData((prev) => ({
      ...prev,
      records: [
        ...prev.records,
        ...recs.map((r) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ...r,
        })),
      ],
    }));
  }

  function resetAllRecords() {
    setData((prev) => {
      const next = { ...prev, records: [] };
      storage.save(next);
      return next;
    });
  }

  function updateRecord(
    id: string,
    changes: Partial<Pick<BaseRecord, "date" | "label" | "points">>
  ) {
    setData((prev) => ({
      ...prev,
      records: prev.records.map((r) => (r.id === id ? { ...r, ...changes } : r)),
    }));
  }

  function addCast(name: string) {
    const id = `cast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setData((prev) => ({
      ...prev,
      staffList: [...prev.staffList, { id, name }],
    }));
  }

  function updateCastName(id: string, name: string) {
    setData((prev) => ({
      ...prev,
      staffList: prev.staffList.map((s) => (s.id === id ? { ...s, name } : s)),
    }));
  }

  function deleteCast(id: string) {
    setData((prev) => ({
      ...prev,
      staffList: prev.staffList.filter((s) => s.id !== id),
      records: prev.records.filter((r) => r.staffId !== id),
    }));
  }

  return {
    data,
    staffList,
    addRecords,
    resetAllRecords,
    updateRecord,
    addCast,
    updateCastName,
    deleteCast,
  };
}
