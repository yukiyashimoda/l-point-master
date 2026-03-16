/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useMemo, useRef, useState } from "react"; // useRef は PDF export の ref で使用
import { Plus, Minus, Menu, X, Trash2, FileDown, Sun, Moon, Pencil, Check } from "lucide-react";
import {
  type AppData,
  type BaseRecord,
  type CategoryType,
  type Staff,
  defaultStaff,
  usePoints,
} from "./usePoints";

type ReservationRecord = { date: string; staffId: string; count: number };
type WorkdayRecord = { date: string; staffId: string };

const CATEGORY_LABELS: Record<CategoryType, string> = {
  douhan: "同伴",
  honshimei: "本指名",
  free: "場内・純フリーポイント",
  bottle: "ボトル",
  yoyaku: "予約ポイント",
  shokai: "紹介ポイント",
  annivWork: "周年Week出勤",
  annivGuests: "周年Week集客ポイント",
};

function getMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isWithinAnnivWeek(dateStr: string) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return month === 3 && day >= 23 && day <= 28;
}

function calculateReservationBonusesFromRecords(
  reservations: ReservationRecord[]
): { bonus: number; date: string; threshold: number }[] {
  if (reservations.length === 0) return [];

  const sorted = [...reservations].sort((a, b) => a.date.localeCompare(b.date));
  const thresholds = [10, 20, 30, 40, 50];
  const reachedDates: Record<number, string> = {};

  let cumulative = 0;
  for (const r of sorted) {
    const prev = cumulative;
    cumulative += r.count;
    for (const th of thresholds) {
      if (prev < th && cumulative >= th && !reachedDates[th]) {
        reachedDates[th] = r.date;
      }
    }
  }

  const results: { bonus: number; date: string; threshold: number }[] = [];
  for (const th of thresholds) {
    if (reachedDates[th]) {
      const bonus =
        th === 10 ? 100 : th === 20 ? 150 : th === 30 ? 200 : th === 40 ? 250 : 300;
      results.push({ bonus, date: reachedDates[th], threshold: th });
    }
  }

  return results;
}

function calculateAnnivStreakBonus(workdays: WorkdayRecord[]): number {
  const dateSet = new Set(
    workdays
      .filter((w) => isWithinAnnivWeek(w.date))
      .map((w) => {
        const d = new Date(w.date);
        return `${d.getMonth() + 1}-${d.getDate()}`;
      })
  );

  const pairs: { a: string; b: string; bonus: number }[] = [
    { a: "3-23", b: "3-24", bonus: 200 },
    { a: "3-25", b: "3-26", bonus: 300 },
    { a: "3-27", b: "3-28", bonus: 400 },
  ];

  return pairs.reduce((sum, pair) => {
    if (dateSet.has(pair.a) && dateSet.has(pair.b)) {
      return sum + pair.bonus;
    }
    return sum;
  }, 0);
}

function usePointAggregation(data: AppData) {
  return useMemo(() => {
    const perStaff: Record<
      string,
      { total: number; monthMap: Record<string, number>; records: BaseRecord[] }
    > = {};

    data.staffList.forEach((s) => {
      perStaff[s.id] = { total: 0, monthMap: {}, records: [] };
    });

    const reservationsByStaffMonth: Record<string, ReservationRecord[]> = {};
    const workdaysByStaffMonth: Record<string, WorkdayRecord[]> = {};
    const bonusRecords: BaseRecord[] = [];

    for (const rec of data.records) {
      const staffAgg = perStaff[rec.staffId] ?? {
        total: 0,
        monthMap: {},
        records: [],
      };
      perStaff[rec.staffId] = staffAgg;

      staffAgg.total += rec.points;
      const monthKey = getMonthKey(rec.date);
      staffAgg.monthMap[monthKey] = (staffAgg.monthMap[monthKey] ?? 0) + rec.points;
      staffAgg.records.push(rec);

      if (rec.category === "yoyaku") {
        const key = `${rec.staffId}-${monthKey}`;
        const yy = rec.meta?.count as number | undefined;
        const count = typeof yy === "number" ? yy : 1;
        if (!reservationsByStaffMonth[key]) reservationsByStaffMonth[key] = [];
        reservationsByStaffMonth[key].push({
          date: rec.date,
          staffId: rec.staffId,
          count,
        });
      }

      if (rec.category === "annivWork") {
        const monthKey2 = getMonthKey(rec.date);
        const key = `${rec.staffId}-${monthKey2}`;
        if (!workdaysByStaffMonth[key]) workdaysByStaffMonth[key] = [];
        workdaysByStaffMonth[key].push({
          date: rec.date,
          staffId: rec.staffId,
        });
      }
    }

    Object.keys(perStaff).forEach((staffId) => {
      const staffAgg = perStaff[staffId];
      const monthKeys = Object.keys(staffAgg.monthMap);
      for (const monthKey of monthKeys) {
        const resKey = `${staffId}-${monthKey}`;
        const workKey = `${staffId}-${monthKey}`;

        const resRecords = reservationsByStaffMonth[resKey] ?? [];
        const bonusEntries = calculateReservationBonusesFromRecords(resRecords);
        if (bonusEntries.length > 0) {
          for (const entry of bonusEntries) {
            const { bonus, date, threshold } = entry;
            staffAgg.total += bonus;
            staffAgg.monthMap[monthKey] += bonus;
            const bonusRecord: BaseRecord = {
              id: `bonus-yoyaku-${staffId}-${monthKey}-${threshold}`,
              date,
              staffId,
              category: "yoyaku",
              label: `予約${threshold}件到達ボーナス（${date.replace(/-/g, "/")}）`,
              points: bonus,
              meta: { monthKey, bonusType: "reservationMonthly", threshold },
            };
            bonusRecords.push(bonusRecord);
            staffAgg.records.push(bonusRecord);
          }
        }
        const workRecords = workdaysByStaffMonth[workKey] ?? [];
        const year = monthKey.split("-")[0];
        const streakDateSet = new Set(
          workRecords
            .filter((w) => isWithinAnnivWeek(w.date))
            .map((w) => {
              const d = new Date(w.date);
              return `${d.getMonth() + 1}-${d.getDate()}`;
            })
        );
        const streakPairDefs = [
          { a: "3-23", b: "3-24", date: `${year}-03-24`, bonus: 200 },
          { a: "3-25", b: "3-26", date: `${year}-03-26`, bonus: 300 },
          { a: "3-27", b: "3-28", date: `${year}-03-28`, bonus: 400 },
        ];
        for (const pair of streakPairDefs) {
          if (streakDateSet.has(pair.a) && streakDateSet.has(pair.b)) {
            staffAgg.total += pair.bonus;
            staffAgg.monthMap[monthKey] += pair.bonus;
            const streakBonusRecord: BaseRecord = {
              id: `bonus-streak-${staffId}-${pair.a.replace("-", "")}`,
              date: pair.date,
              staffId,
              category: "annivWork",
              label: `${pair.a.replace("3-", "3/")}＆${pair.b.replace("3-", "3/")} 連続出勤ボーナス`,
              points: pair.bonus,
              meta: { bonusType: "streakBonus", pair: `${pair.a}/${pair.b}` },
            };
            bonusRecords.push(streakBonusRecord);
            staffAgg.records.push(streakBonusRecord);
          }
        }
      }
    });

    const ranking = data.staffList
      .map((s) => ({
        staff: s,
        total: perStaff[s.id]?.total ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { perStaff, ranking, bonusRecords };
  }, [data]);
}

async function exportToPdf(element: HTMLElement, filename: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // スクロール制限を外したクローンを作成して全体を捕捉
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;left:-9999px;top:0;z-index:-1;width:" +
    Math.max(element.scrollWidth, element.offsetWidth) +
    "px;";
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  wrap.appendChild(clone);
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: "#1e293b",
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdfW = 595.28;
    const pdfH = (canvas.height / canvas.width) * pdfW;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: pdfH > 841.89 ? [pdfW, pdfH] : "a4",
    });
    pdf.addImage(imgData, "PNG", 0, 0, pdfW, Math.min(pdfH, pdf.internal.pageSize.getHeight()));
    pdf.save(filename);
  } finally {
    document.body.removeChild(wrap);
  }
}

function CounterInput({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-emerald-700 bg-white">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-l-full bg-emerald-100 text-emerald-700 active:bg-emerald-200"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="min-w-[2.5rem] text-center text-sm font-semibold text-slate-900">
        {value}
      </div>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-r-full bg-emerald-600 text-white active:bg-emerald-700"
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Home() {
  const {
    data: appData,
    staffList,
    addRecords,
    resetAllRecords,
    updateRecord,
    addCast,
    updateCastName,
    deleteCast,
  } = usePoints();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("auth") === "1";
  });
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState(false);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loginId === "L" && loginPass === "3150") {
      sessionStorage.setItem("auth", "1");
      setIsLoggedIn(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      setLoginPass("");
    }
  }

  const [selectedStaffId, setSelectedStaffId] = useState<string>(defaultStaff[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
  });
  const [activeTab, setActiveTab] = useState<"admin" | "view">("admin");
  const [selectedViewStaff, setSelectedViewStaff] = useState<string | "all">("all");

  const [douhanCount, setDouhanCount] = useState(0);
  const [douhanLate, setDouhanLate] = useState(false);

  const [honshimeiCount, setHonshimeiCount] = useState(0);

  const [freeWithHonshimeiCount, setFreeWithHonshimeiCount] = useState(0);
  const [pureFreeCount, setPureFreeCount] = useState(0);

  const [bottleType, setBottleType] = useState<"normal" | "anniv">("normal");
  const [bottleAmount, setBottleAmount] = useState<number | "">("");
  const [bottlePeople, setBottlePeople] = useState(1);

  const [yoyakuCount, setYoyakuCount] = useState(0);

  const [shokaiCastCount, setShokaiCastCount] = useState(0);
  const [shokaiCastStore, setShokaiCastStore] = useState("");
  const [shokaiCastName, setShokaiCastName] = useState("");
  const [shokaiStaffCount, setShokaiStaffCount] = useState(0);
  const [shokaiStaffStore, setShokaiStaffStore] = useState("");
  const [shokaiStaffName, setShokaiStaffName] = useState("");
  const [shokaiTaikenCount, setShokaiTaikenCount] = useState(0);
  const [shokaiTaikenStore, setShokaiTaikenStore] = useState("");
  const [shokaiTaikenName, setShokaiTaikenName] = useState("");

  const [annivWork, setAnnivWork] = useState(false);

  const [annivGuestType, setAnnivGuestType] = useState<"general" | "party">("general");
  const [annivGuestCount, setAnnivGuestCount] = useState(0);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRecords, setPendingRecords] = useState<Omit<BaseRecord, "id">[]>([]);
  const [showRegisteredToast, setShowRegisteredToast] = useState(false);
  const [rankingDetailStaffId, setRankingDetailStaffId] = useState<string | null>(null);
  const [rankingExpanded, setRankingExpanded] = useState(false);
  const [rankingExportMode, setRankingExportMode] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const rankingRef = useRef<HTMLElement>(null);
  const monthlyHistoryRef = useRef<HTMLDivElement>(null);
  const modalDetailRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as "dark" | "light") ?? "dark";
  });

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      return next;
    });
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addCastModalOpen, setAddCastModalOpen] = useState(false);
  const [newCastName, setNewCastName] = useState("");
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetPinError, setResetPinError] = useState(false);
  const [resetPinVerified, setResetPinVerified] = useState(false);
  const [editingCastId, setEditingCastId] = useState<string | null>(null);
  const [editingCastName, setEditingCastName] = useState("");
  const [deleteCastId, setDeleteCastId] = useState<string | null>(null);
  const [deleteCastPin, setDeleteCastPin] = useState("");
  const [deleteCastPinError, setDeleteCastPinError] = useState(false);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [editRecordPin, setEditRecordPin] = useState("");
  const [editRecordPinError, setEditRecordPinError] = useState(false);
  const [editRecordPinVerified, setEditRecordPinVerified] = useState(false);
  const [editRecordDate, setEditRecordDate] = useState("");
  const [editRecordLabel, setEditRecordLabel] = useState("");
  const [editRecordPoints, setEditRecordPoints] = useState<number | "">("");

  const aggregation = usePointAggregation(appData);

  function buildRecordsFromForm(): Omit<BaseRecord, "id">[] {
    const list: Omit<BaseRecord, "id">[] = [];
    if (!selectedStaffId || !selectedDate) return list;

    if (douhanCount > 0) {
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "douhan",
        label: `同伴 ${douhanCount}件${douhanLate ? "（遅刻券あり）" : ""}`,
        points: douhanCount * 30,
        meta: { count: douhanCount, lateTicket: douhanLate },
      });
    }

    if (honshimeiCount > 0) {
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "honshimei",
        label: `本指名 ${honshimeiCount}件`,
        points: honshimeiCount * 20,
        meta: { count: honshimeiCount },
      });
    }

    if (freeWithHonshimeiCount > 0) {
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "free",
        label: `場内・純フリーポイント(本指名あり) ${freeWithHonshimeiCount}組`,
        points: freeWithHonshimeiCount * 10,
        meta: { count: freeWithHonshimeiCount, type: "withHonshimei" },
      });
    }

    if (pureFreeCount > 0) {
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "free",
        label: `場内・純フリーポイント(純フリー) ${pureFreeCount}組`,
        points: pureFreeCount * 20,
        meta: { count: pureFreeCount, type: "pureFree" },
      });
    }

    if (bottleAmount && bottlePeople > 0) {
      const amount = typeof bottleAmount === "number" ? bottleAmount : Number(bottleAmount);
      if (!Number.isNaN(amount) && amount > 0) {
        const perPerson =
          bottleType === "normal"
            ? (amount / 1000) / bottlePeople
            : ((amount / 1000) * 2) / bottlePeople;
        const rounded = Math.floor(perPerson);
        list.push({
          date: selectedDate,
          staffId: selectedStaffId,
          category: "bottle",
          label:
            bottleType === "normal"
              ? `ボトル通常 ¥${amount.toLocaleString()} / ${bottlePeople}人`
              : `ボトル16周年特別 ¥${amount.toLocaleString()} / ${bottlePeople}人`,
          points: rounded,
          meta: { amount, people: bottlePeople, type: bottleType },
        });
      }
    }

    if (yoyakuCount > 0) {
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "yoyaku",
        label: `予約 ${yoyakuCount}組`,
        points: yoyakuCount * 30,
        meta: { count: yoyakuCount },
      });
    }

    if (shokaiCastCount > 0) {
      const namePart = [shokaiCastStore, shokaiCastName].filter(Boolean).join(" / ");
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "shokai",
        label: `紹介(キャスト採用) ${shokaiCastCount}件${namePart ? ` [${namePart}]` : ""}`,
        points: shokaiCastCount * 200,
        meta: { count: shokaiCastCount, type: "cast", store: shokaiCastStore, name: shokaiCastName },
      });
    }

    if (shokaiStaffCount > 0) {
      const namePart = [shokaiStaffStore, shokaiStaffName].filter(Boolean).join(" / ");
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "shokai",
        label: `紹介(スタッフ採用) ${shokaiStaffCount}件${namePart ? ` [${namePart}]` : ""}`,
        points: shokaiStaffCount * 200,
        meta: { count: shokaiStaffCount, type: "staff", store: shokaiStaffStore, name: shokaiStaffName },
      });
    }

    if (shokaiTaikenCount > 0) {
      const namePart = [shokaiTaikenStore, shokaiTaikenName].filter(Boolean).join(" / ");
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "shokai",
        label: `紹介(1日体験) ${shokaiTaikenCount}件${namePart ? ` [${namePart}]` : ""}`,
        points: shokaiTaikenCount * 20,
        meta: { count: shokaiTaikenCount, type: "taiken", store: shokaiTaikenStore, name: shokaiTaikenName },
      });
    }

    if (annivWork && isWithinAnnivWeek(selectedDate)) {
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "annivWork",
        label: "周年Week出勤 1日",
        points: 100,
        meta: {},
      });
    }

    if (annivGuestCount > 0) {
      const per = annivGuestType === "general" ? 2 : 1;
      list.push({
        date: selectedDate,
        staffId: selectedStaffId,
        category: "annivGuests",
        label:
          annivGuestType === "general"
            ? `周年Week集客ポイント 一般 ${annivGuestCount}名`
            : `周年Week集客ポイント 女性PT ${annivGuestCount}名`,
        points: annivGuestCount * per,
        meta: { count: annivGuestCount, type: annivGuestType },
      });
    }

    return list;
  }

  function resetForm() {
    setDouhanCount(0);
    setDouhanLate(false);
    setHonshimeiCount(0);
    setFreeWithHonshimeiCount(0);
    setPureFreeCount(0);
    setBottleAmount("");
    setBottlePeople(1);
    setYoyakuCount(0);
    setShokaiCastCount(0);
    setShokaiCastStore("");
    setShokaiCastName("");
    setShokaiStaffCount(0);
    setShokaiStaffStore("");
    setShokaiStaffName("");
    setShokaiTaikenCount(0);
    setShokaiTaikenStore("");
    setShokaiTaikenName("");
    setAnnivWork(false);
    setAnnivGuestCount(0);
  }

  async function handleExportRanking() {
    if (!rankingRef.current || pdfExporting) return;
    setPdfExporting(true);
    setRankingExportMode(true);
    await new Promise((r) => setTimeout(r, 80));
    try {
      await exportToPdf(rankingRef.current, "ranking.pdf");
    } finally {
      setRankingExportMode(false);
      setPdfExporting(false);
    }
  }

  async function handleExportMonthlyHistory() {
    if (!monthlyHistoryRef.current || pdfExporting) return;
    setPdfExporting(true);
    try {
      const staffName = staffList.find((s) => s.id === activeViewStaffId)?.name ?? "cast";
      await exportToPdf(monthlyHistoryRef.current, `monthly-${staffName}.pdf`);
    } finally {
      setPdfExporting(false);
    }
  }

  async function handleExportModalDetail() {
    if (!modalDetailRef.current || pdfExporting) return;
    setPdfExporting(true);
    try {
      const staffName = staffList.find((s) => s.id === rankingDetailStaffId)?.name ?? "cast";
      await exportToPdf(modalDetailRef.current, `detail-${staffName}.pdf`);
    } finally {
      setPdfExporting(false);
    }
  }

  function handleResetPinSubmit() {
    if (resetPin === "3150") {
      setResetPinError(false);
      setResetPinVerified(true);
    } else {
      setResetPinError(true);
      setResetPin("");
    }
  }

  function handleResetAll() {
    resetAllRecords();
    setResetModalOpen(false);
    setResetPin("");
    setResetPinVerified(false);
    setResetPinError(false);
  }

  function openEditRecord(r: BaseRecord) {
    setEditRecordId(r.id);
    setEditRecordPin("");
    setEditRecordPinError(false);
    setEditRecordPinVerified(false);
    setEditRecordDate(r.date);
    setEditRecordLabel(r.label);
    setEditRecordPoints(r.points);
  }

  function handleEditRecordPinSubmit() {
    if (editRecordPin === "3150") {
      setEditRecordPinError(false);
      setEditRecordPinVerified(true);
    } else {
      setEditRecordPinError(true);
      setEditRecordPin("");
    }
  }

  function handleSaveRecord() {
    if (!editRecordId || editRecordPoints === "") return;
    updateRecord(editRecordId, {
      date: editRecordDate,
      label: editRecordLabel,
      points: Number(editRecordPoints),
    });
    setEditRecordId(null);
  }

  function handleSaveCastName() {
    const trimmed = editingCastName.trim();
    if (!trimmed || !editingCastId) return;
    updateCastName(editingCastId, trimmed);
    setEditingCastId(null);
    setEditingCastName("");
  }

  function handleDeleteCastConfirm() {
    if (deleteCastPin !== "3150") {
      setDeleteCastPinError(true);
      setDeleteCastPin("");
      return;
    }
    if (deleteCastId) deleteCast(deleteCastId);
    setDeleteCastId(null);
    setDeleteCastPin("");
    setDeleteCastPinError(false);
  }

  function handleAddCast() {
    const trimmed = newCastName.trim();
    if (!trimmed) return;
    addCast(trimmed);
    setNewCastName("");
    setAddCastModalOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStaffId || !selectedDate) return;

    const list = buildRecordsFromForm();
    if (list.length === 0) return;
    setPendingRecords(list);
    setConfirmOpen(true);
  }

  function handleConfirmRegister() {
    addRecords(pendingRecords);
    setPendingRecords([]);
    setConfirmOpen(false);
    resetForm();
    if (typeof window !== "undefined") {
      setShowRegisteredToast(true);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  const activeViewStaffId =
    selectedViewStaff === "all"
      ? null
      : selectedViewStaff || (staffList.length > 0 ? staffList[0].id : null);

  const allRecords = useMemo(
    () => [...appData.records, ...aggregation.bonusRecords],
    [appData.records, aggregation.bonusRecords]
  );

  const sortedRecords = useMemo(() => {
    return [...allRecords].sort((a, b) => {
      if (a.date === b.date) {
        return a.id.localeCompare(b.id);
      }
      return a.date.localeCompare(b.date);
    });
  }, [allRecords]);

  const monthlySummary = useMemo(() => {
    const map: Record<string, Record<string, Partial<Record<CategoryType, number>>>> = {};

    for (const r of allRecords) {
      const monthKey = getMonthKey(r.date);
      if (monthKey === "unknown") continue;
      if (!map[r.staffId]) map[r.staffId] = {};
      if (!map[r.staffId][monthKey]) map[r.staffId][monthKey] = {};
      const monthMap = map[r.staffId][monthKey]!;
      const cat = r.category;
      monthMap[cat] = (monthMap[cat] ?? 0) + r.points;
    }

    return map;
  }, [appData.records, aggregation.bonusRecords]);

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-xs rounded-2xl bg-slate-900 p-6 shadow-xl shadow-black/40 ring-1 ring-slate-700">
          <h1 className="mb-6 text-center text-base font-bold text-slate-50">エルコンポイントマスターβ</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">ID</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-50 outline-none focus:border-emerald-500 placeholder:text-slate-500"
                placeholder="ID を入力"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">パスワード</label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-50 outline-none focus:border-emerald-500 placeholder:text-slate-500"
                placeholder="パスワードを入力"
              />
            </div>
            {loginError && (
              <p className="text-xs text-red-400">IDまたはパスワードが違います</p>
            )}
            <button
              type="submit"
              className="mt-2 flex h-10 w-full items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen bg-slate-950 text-slate-50 ${theme === "light" ? "day" : ""}`}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* キャスト一覧サイドバー */}
      <aside
        className={`fixed left-0 top-0 z-30 flex h-screen w-52 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 sm:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
          <h2 className="text-xs font-semibold text-slate-100">キャスト一覧</h2>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:text-white sm:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {staffList.map((s) => (
            <div key={s.id} className="group flex items-center">
              {editingCastId === s.id ? (
                <div className="flex flex-1 items-center gap-1 px-2 py-1">
                  <input
                    type="text"
                    value={editingCastName}
                    onChange={(e) => setEditingCastName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveCastName();
                      if (e.key === "Escape") setEditingCastId(null);
                    }}
                    className="h-7 flex-1 min-w-0 rounded border border-slate-600 bg-slate-800 px-2 text-xs text-slate-50 outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveCastName}
                    disabled={!editingCastName.trim()}
                    className="flex-shrink-0 rounded p-1 text-emerald-400 hover:bg-slate-700 disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCastId(null)}
                    className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className={`flex-1 min-w-0 truncate px-3 py-2 text-left text-xs transition-colors hover:bg-slate-800 rounded-lg ${
                      selectedStaffId === s.id
                        ? `bg-slate-800 font-bold ${theme === "light" ? "text-slate-900" : "text-white"}`
                        : "text-slate-300"
                    }`}
                    onClick={() => {
                      setSelectedStaffId(s.id);
                      setSelectedViewStaff(s.id);
                      setRankingDetailStaffId(s.id);
                      setSidebarOpen(false);
                    }}
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingCastId(s.id); setEditingCastName(s.name); }}
                    className="flex-shrink-0 px-1 py-2 text-slate-600 opacity-0 transition-opacity hover:text-blue-400 group-hover:opacity-100"
                    aria-label="名前を編集"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteCastId(s.id); setDeleteCastPin(""); setDeleteCastPinError(false); }}
                    className="flex-shrink-0 pr-2 pl-0.5 py-2 text-slate-600 opacity-0 transition-opacity hover:text-emerald-400 group-hover:opacity-100"
                    aria-label="キャストを削除"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 p-2 space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800"
            onClick={() => setAddCastModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            キャスト追加
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            onClick={() => { sessionStorage.removeItem("auth"); setIsLoggedIn(false); }}
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div className="flex min-w-0 flex-1 flex-col sm:ml-52">
        <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-3 py-4 sm:px-4 sm:py-6">
        <header className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="mt-0.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white sm:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="キャスト一覧を開く"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                エルコンポイントマスターβ
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start mt-2">
            <button
              type="button"
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "デイモードに切替" : "ナイトモードに切替"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="rounded-full p-1.5 text-slate-500 hover:bg-emerald-900/40 hover:text-emerald-400 transition-colors"
              onClick={() => {
                setResetModalOpen(true);
                setResetPin("");
                setResetPinVerified(false);
                setResetPinError(false);
              }}
              aria-label="データをリセット"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="mb-4 flex rounded-full bg-slate-800 p-1 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("admin")}
            className={`flex-1 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 ${
              activeTab === "admin"
                ? "bg-slate-50 text-slate-900"
                : "text-slate-300 hover:text-white"
            }`}
          >
            入力（Admin）
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("view")}
            className={`flex-1 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 ${
              activeTab === "view"
                ? "bg-slate-50 text-slate-900"
                : "text-slate-300 hover:text-white"
            }`}
          >
            ランキング / 履歴
          </button>
        </div>

        {activeTab === "admin" ? (
          <main className="mb-4 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-900/70 p-3 sm:space-y-4 sm:p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-200 sm:text-sm">
                    キャスト <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-50 outline-none focus:border-blue-500 sm:h-10 sm:text-sm"
                    required
                  >
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-200 sm:text-sm">
                    出勤日 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-50 outline-none focus:border-blue-500 sm:h-10 sm:text-sm"
                    required
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                      同伴ポイント
                    </h2>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col text-[11px] text-slate-300 sm:text-xs">
                      <span>21:00（遅刻券使用時 21:30〜22:00）迄の同伴 1回につき 30P</span>
                      <label className="mt-1 inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={douhanLate}
                          onChange={(e) => setDouhanLate(e.target.checked)}
                          className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-0"
                        />
                        <span className="text-[10px] text-slate-400 sm:text-xs">
                          遅刻券あり
                        </span>
                      </label>
                    </div>
                    <CounterInput value={douhanCount} onChange={setDouhanCount} />
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                      本指名ポイント
                    </h2>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col text-[11px] text-slate-300 sm:text-xs">
                      <span>本指名（1回 20P）</span>
                    </div>
                    <CounterInput value={honshimeiCount} onChange={setHonshimeiCount} />
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                      場内・純フリーポイント
                    </h2>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-300 sm:text-xs">本指名あり（1組 10P）</span>
                      <CounterInput value={freeWithHonshimeiCount} onChange={setFreeWithHonshimeiCount} />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-700 pt-2">
                      <span className="text-[11px] text-slate-300 sm:text-xs">純フリー（1組 20P）</span>
                      <CounterInput value={pureFreeCount} onChange={setPureFreeCount} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                      ボトルポイント
                    </h2>
                    <span className="text-[10px] text-slate-400 sm:text-[11px]">
                      ※本指名・純フリーのみ対象・複数の場合は対象キャストの数で均等割り
                    </span>
                  </div>
                  <div className="space-y-2">
                    <select
                      value={bottleType}
                      onChange={(e) =>
                        setBottleType(e.target.value === "anniv" ? "anniv" : "normal")
                      }
                      className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-50 outline-none focus:border-blue-500 sm:h-10 sm:text-sm"
                    >
                      <option value="normal">通常ボトル（¥1,000 / 1P）</option>
                      <option value="anniv">★16周年特別ボトル（¥1,000 / 2P）</option>
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-slate-300 sm:text-xs">金額(円)</label>
                        <input
                          type="number"
                          min={0}
                          value={bottleAmount}
                          onChange={(e) =>
                            setBottleAmount(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-50 outline-none focus:border-blue-500 sm:h-10 sm:text-sm"
                          placeholder="価格を入れてください"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-slate-300 sm:text-xs text-right">
                          均等割の場合はここに人数を入れてください。
                        </label>
                        <div className="flex justify-end">
                          <CounterInput
                            value={bottlePeople}
                            onChange={setBottlePeople}
                            min={1}
                          />
                        </div>
                      </div>
                    </div>
                    {bottleAmount && bottlePeople > 0 && (
                      <p className="text-[10px] text-slate-400 sm:text-xs">
                        1人あたりポイント（概算）は送信時に自動計算されます。
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">予約ポイント</h2>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col text-[11px] text-slate-300 sm:text-xs">
                      <span>予約（1組 30P）</span>
                      <span className="text-[10px] text-slate-400 sm:text-xs">
                        個別30Pとは別に、月間累計に応じたボーナスを自動加算
                      </span>
                      <span className="mt-0.5 text-[10px] text-slate-500 sm:text-[11px]">
                        10組:+100 / 20組:+150 / 30組:+200 / 40組:+250 / 50組:+300（各スタッフ・各月で一度だけ）
                      </span>
                    </div>
                    <CounterInput value={yoyakuCount} onChange={setYoyakuCount} />
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">紹介ポイント</h2>
                  </div>
                  <div className="space-y-4">
                    {/* キャスト採用 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-300 sm:text-xs">紹介（キャスト採用）200P/人</span>
                        <CounterInput value={shokaiCastCount} onChange={setShokaiCastCount} />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shokaiCastStore}
                          onChange={(e) => setShokaiCastStore(e.target.value)}
                          placeholder="店舗名"
                          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-50 outline-none focus:border-blue-500 placeholder:text-slate-500"
                        />
                        <input
                          type="text"
                          value={shokaiCastName}
                          onChange={(e) => setShokaiCastName(e.target.value)}
                          placeholder="名前"
                          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-50 outline-none focus:border-blue-500 placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                    {/* スタッフ採用 */}
                    <div className="space-y-1.5 border-t border-slate-700 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-300 sm:text-xs">紹介（スタッフ採用）200P/人</span>
                        <CounterInput value={shokaiStaffCount} onChange={setShokaiStaffCount} />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shokaiStaffStore}
                          onChange={(e) => setShokaiStaffStore(e.target.value)}
                          placeholder="店舗名"
                          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-50 outline-none focus:border-blue-500 placeholder:text-slate-500"
                        />
                        <input
                          type="text"
                          value={shokaiStaffName}
                          onChange={(e) => setShokaiStaffName(e.target.value)}
                          placeholder="名前"
                          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-50 outline-none focus:border-blue-500 placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                    {/* 1日体験 */}
                    <div className="space-y-1.5 border-t border-slate-700 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-300 sm:text-xs">1日体験 20P/人</span>
                        <CounterInput value={shokaiTaikenCount} onChange={setShokaiTaikenCount} />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shokaiTaikenStore}
                          onChange={(e) => setShokaiTaikenStore(e.target.value)}
                          placeholder="店舗名"
                          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-50 outline-none focus:border-blue-500 placeholder:text-slate-500"
                        />
                        <input
                          type="text"
                          value={shokaiTaikenName}
                          onChange={(e) => setShokaiTaikenName(e.target.value)}
                          placeholder="名前"
                          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-50 outline-none focus:border-blue-500 placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                      周年WEEK出勤ボーナス
                    </h2>
                  </div>
                  <label className="flex items-center justify-between gap-2">
                    <div className="flex flex-col text-[11px] text-slate-300 sm:text-xs">
                      <span>周年Week出勤（1日 100P）</span>
                      <span className="text-[10px] text-slate-400 sm:text-xs">
                        期間: 3/23〜3/28・特定ペア連続出勤ボーナスあり
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={annivWork}
                      onChange={(e) => setAnnivWork(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-0"
                    />
                  </label>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                      周年WEEK集客ポイント
                    </h2>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={annivGuestType}
                      onChange={(e) =>
                        setAnnivGuestType(e.target.value === "party" ? "party" : "general")
                      }
                      className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-50 outline-none focus:border-blue-500 sm:h-10 sm:text-sm"
                    >
                      <option value="general">一般集客 2P/名</option>
                      <option value="party">女ドリ別パーティー 1P/名</option>
                    </select>
                    <CounterInput value={annivGuestCount} onChange={setAnnivGuestCount} />
                  </div>
                </div>
              </section>

              <div className="sticky bottom-0 pt-1">
                <button
                  type="submit"
                  className="flex h-11 w-full items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white shadow-lg shadow-emerald-600/40 transition active:bg-emerald-700 sm:h-12 sm:text-sm"
                >
                  この内容でポイント登録
                </button>
              </div>
            </form>
          </main>
        ) : (
          <main className="mb-4 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-900/70 p-3 sm:space-y-4 sm:p-4">
            <section ref={rankingRef} className="space-y-2 rounded-2xl bg-slate-800/80 p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                  キャスト別ランキング（全期間）
                </h2>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 sm:text-xs">
                    登録件数 {appData.records.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleExportRanking}
                    disabled={pdfExporting || aggregation.ranking.length === 0}
                    className="flex items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-600 disabled:opacity-40"
                  >
                    <FileDown className="h-3 w-3" />
                    PDF
                  </button>
                </div>
              </div>
              <ol className="space-y-1.5">
                {aggregation.ranking
                  .slice(0, (rankingExpanded || rankingExportMode) ? undefined : 10)
                  .map((row, idx) => {
                    const rank = idx + 1;
                    const rowBg = rank <= 10
                      ? (theme === "light" ? "bg-white" : "bg-slate-900/80")
                      : "bg-slate-900/80";
                    const badgeBg =
                      rank === 1
                        ? "bg-yellow-400 text-yellow-900"
                        : rank === 2
                          ? "bg-slate-300 text-slate-700"
                          : rank === 3
                            ? "bg-amber-600 text-white"
                            : rank <= 10
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-slate-800 text-slate-200";
                    return (
                      <li
                        key={row.staff.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs sm:text-sm hover:brightness-110 ${rowBg}`}
                        onClick={() => setRankingDetailStaffId(row.staff.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${badgeBg}`}>
                            {rank}
                          </span>
                          <span className="font-medium text-slate-50">{row.staff.name}</span>
                        </div>
                        <span className={`text-right text-xs font-semibold sm:text-sm ${theme === "light" ? "text-slate-900 font-bold" : "text-blue-300"}`}>
                          {row.total} P
                        </span>
                      </li>
                    );
                  })}
                {aggregation.ranking.length === 0 && (
                  <p className="text-[11px] text-slate-400 sm:text-xs">
                    まだデータがありません。Adminタブから登録してください。
                  </p>
                )}
              </ol>
              {aggregation.ranking.length > 10 && (
                <button
                  type="button"
                  className="mt-1 w-full rounded-xl border border-slate-700 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  onClick={() => setRankingExpanded((v) => !v)}
                >
                  {rankingExpanded
                    ? "折りたたむ ▲"
                    : `もっと表示（残り ${aggregation.ranking.length - 10} 名）▼`}
                </button>
              )}
            </section>

            <section className="space-y-2 rounded-2xl bg-slate-800/80 p-3 sm:p-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xs font-semibold text-slate-100 sm:text-sm">
                  月間獲得履歴（キャスト別）
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportMonthlyHistory}
                    disabled={pdfExporting || !activeViewStaffId}
                    className="flex items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-600 disabled:opacity-40"
                  >
                    <FileDown className="h-3 w-3" />
                    PDF
                  </button>
                  <select
                    value={selectedViewStaff}
                    onChange={(e) =>
                      setSelectedViewStaff(
                        e.target.value === "all" ? "all" : (e.target.value as string)
                      )
                    }
                    className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-50 outline-none focus:border-blue-500 sm:h-10 sm:text-sm"
                  >
                    <option value="all">キャストを選択</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div ref={monthlyHistoryRef} className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {activeViewStaffId &&
                  monthlySummary[activeViewStaffId] &&
                  Object.keys(monthlySummary[activeViewStaffId])
                    .sort()
                    .map((monthKey) => {
                      const monthData = monthlySummary[activeViewStaffId]![monthKey]!;
                      const [year, month] = monthKey.split("-");
                      const monthLabel = `${year}年${month}月`;
                      const categoryOrder: CategoryType[] = [
                        "douhan",
                        "honshimei",
                        "free",
                        "bottle",
                        "yoyaku",
                        "shokai",
                        "annivWork",
                        "annivGuests",
                      ];
                      const items = categoryOrder.filter(
                        (cat) => (monthData[cat] ?? 0) > 0
                      );

                      if (items.length === 0) return null;

                      const total = items.reduce(
                        (sum, cat) => sum + (monthData[cat] ?? 0),
                        0
                      );

                      const monthlyRecords = sortedRecords.filter(
                        (r) =>
                          r.staffId === activeViewStaffId &&
                          getMonthKey(r.date) === monthKey
                      );

                      return (
                        <div
                          key={monthKey}
                          className="space-y-1.5 rounded-xl bg-slate-900/80 px-3 py-2 text-[11px] sm:text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-100">
                              {monthLabel}
                            </span>
                            <span className="text-[11px] font-semibold text-blue-300 sm:text-xs">
                              合計 {total} P
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {items.map((cat) => (
                              <div
                                key={cat}
                                className="flex items-center justify-between text-slate-300"
                              >
                                <span>{CATEGORY_LABELS[cat]}</span>
                                <span className="font-medium text-blue-200">
                                  {monthData[cat]} P
                                </span>
                              </div>
                            ))}
                          </div>

                          {monthlyRecords.length > 0 && (
                            <div className="mt-2 space-y-0.5 border-t border-slate-800 pt-1.5">
                              {monthlyRecords.map((r) => (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between text-[10px] text-slate-400 sm:text-[11px]"
                                >
                                  <span>
                                    {r.date.replace(/-/g, "/")} | {r.label}
                                  </span>
                                  <span className="ml-2 whitespace-nowrap text-blue-300">
                                    {r.points} P
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                {!activeViewStaffId && (
                  <p className="text-[11px] text-slate-400 sm:text-xs">
                    キャストを選択すると、月間の項目別ポイント合計が表示されます。
                  </p>
                )}
              </div>
            </section>
          </main>
        )}

          <footer className="mt-auto pt-3 pb-2 text-center text-[10px] text-slate-500 sm:text-xs">
            © Neo Snack L 2026
          </footer>
        </div>
      </div>

      {showRegisteredToast && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="rounded-full bg-slate-900/95 px-4 py-2 text-xs font-medium text-slate-50 shadow-lg shadow-black/40 sm:text-sm">
            登録しました
          </div>
        </div>
      )}

      {rankingDetailStaffId && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 shadow-xl shadow-black/40 ring-1 ring-slate-700">
            <div className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-50 sm:text-base">
                月間カテゴリ別集計
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
                キャスト：
                {
                  staffList.find((s) => s.id === rankingDetailStaffId)?.name ??
                  "不明キャスト"
                }
              </p>
            </div>
            <div ref={modalDetailRef} className="max-h-[55vh] space-y-2 overflow-y-auto px-4 py-3 text-[11px] sm:text-xs">
              {!monthlySummary[rankingDetailStaffId] && (
                <p className="py-4 text-center text-slate-400">まだ記録がありません</p>
              )}
              {Object.keys(monthlySummary[rankingDetailStaffId] ?? {})
                .sort()
                .map((monthKey) => {
                  const [year, month] = monthKey.split("-");
                  const monthLabel = `${year}年${month}月`;

                  const monthRecords = allRecords.filter(
                    (r) =>
                      r.staffId === rankingDetailStaffId &&
                      getMonthKey(r.date) === monthKey
                  );

                  const summaryMap: Record<
                    string,
                    { label: string; points: number; count: number }
                  > = {};

                  function addSummary(
                    key: string,
                    label: string,
                    points: number,
                    count: number
                  ) {
                    if (!summaryMap[key]) {
                      summaryMap[key] = { label, points: 0, count: 0 };
                    }
                    summaryMap[key].points += points;
                    summaryMap[key].count += count;
                  }

                  const reservationBonusDetails: {
                    threshold: number;
                    points: number;
                  }[] = [];

                  const streakBonusDetails: {
                    label: string;
                    points: number;
                  }[] = [];

                  for (const r of monthRecords) {
                    const baseCount =
                      typeof (r.meta as any)?.count === "number"
                        ? ((r.meta as any).count as number)
                        : 1;

                    if (r.category === "yoyaku" && (r.meta as any)?.bonusType === "reservationMonthly") {
                      addSummary("yoyakuBonus", "予約ボーナス", r.points, 1);
                      const th = (r.meta as any)?.threshold as number | undefined;
                      if (typeof th === "number") {
                        reservationBonusDetails.push({ threshold: th, points: r.points });
                      }
                    } else if (r.category === "yoyaku") {
                      addSummary("yoyaku", "予約", r.points, baseCount);
                    } else if (r.category === "douhan") {
                      addSummary("douhan", CATEGORY_LABELS.douhan, r.points, baseCount);
                    } else if (r.category === "honshimei") {
                      addSummary("honshimei", CATEGORY_LABELS.honshimei, r.points, baseCount);
                    } else if (r.category === "free") {
                      addSummary("free", CATEGORY_LABELS.free, r.points, baseCount);
                    } else if (r.category === "bottle") {
                      addSummary("bottle", CATEGORY_LABELS.bottle, r.points, 1);
                    } else if (r.category === "shokai") {
                      addSummary("shokai", CATEGORY_LABELS.shokai, r.points, baseCount);
                    } else if (r.category === "annivWork") {
                      if ((r.meta as any)?.bonusType === "streakBonus") {
                        addSummary("annivWorkStreak", "連続出勤ボーナス", r.points, 1);
                      } else {
                        addSummary("annivWork", CATEGORY_LABELS.annivWork, r.points, baseCount);
                      }
                    } else if (r.category === "annivGuests") {
                      addSummary("annivGuests", CATEGORY_LABELS.annivGuests, r.points, baseCount);
                    }
                  }

                  // 連続出勤ボーナス内訳（bonusRecordsから直接取得）
                  monthRecords
                    .filter(
                      (r) =>
                        r.category === "annivWork" &&
                        (r.meta as any)?.bonusType === "streakBonus"
                    )
                    .forEach((r) => {
                      streakBonusDetails.push({ label: r.label, points: r.points });
                    });

                  const order = [
                    "douhan",
                    "honshimei",
                    "free",
                    "bottle",
                    "yoyaku",
                    "yoyakuBonus",
                    "shokai",
                    "annivWork",
                    "annivWorkStreak",
                    "annivGuests",
                  ];

                  const items = order
                    .map((key) => summaryMap[key])
                    .filter((v): v is { label: string; points: number; count: number } => !!v);

                  if (items.length === 0) return null;

                  const total = items.reduce((sum, it) => sum + it.points, 0);

                  return (
                    <div
                      key={monthKey}
                      className="space-y-1.5 rounded-xl bg-slate-950/70 px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-100">
                          {monthLabel}
                        </span>
                        <span className="text-[11px] font-semibold text-blue-300 sm:text-xs">
                          合計 {total} P
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {items.map((it) => (
                          <div
                            key={it.label}
                            className="flex items-center justify-between text-slate-300"
                          >
                            <span>{it.label}</span>
                            <span className="font-medium text-blue-200">
                              {it.points} P / {it.count}件
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* 個別記録一覧（日付付き詳細） */}
                      {monthRecords.length > 0 && (
                        <div className="mt-2 space-y-0.5 border-t border-slate-700 pt-1.5">
                          <p className="mb-1 text-[10px] font-semibold text-slate-400">詳細な内訳</p>
                          {monthRecords
                            .filter((r) => !(r.meta as any)?.bonusType)
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((r) => {
                              const isEditable = appData.records.some((ar) => ar.id === r.id);
                              return (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between gap-1 text-[10px] text-slate-400"
                                >
                                  <span className="min-w-0 truncate">
                                    {r.date.replace(/-/g, "/")}　{r.label}
                                  </span>
                                  <div className="flex flex-shrink-0 items-center gap-1">
                                    <span className="text-blue-300">{r.points} P</span>
                                    {isEditable && (
                                      <button
                                        type="button"
                                        onClick={() => openEditRecord(r)}
                                        className="rounded p-0.5 text-slate-500 hover:text-blue-400"
                                        aria-label="記録を編集"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {(reservationBonusDetails.length > 0 ||
                        streakBonusDetails.length > 0) && (
                        <div className="mt-2 space-y-1 border-t border-slate-800 pt-1.5 text-[10px] text-slate-400 sm:text-[11px]">
                          {reservationBonusDetails.length > 0 && (
                            <div>
                              <p className="font-semibold text-slate-200">
                                予約ボーナス内訳
                              </p>
                              <ul className="mt-0.5 space-y-0.5">
                                {reservationBonusDetails.map((b, idx) => (
                                  <li key={`${b.threshold}-${idx}`} className="flex justify-between">
                                    <span>
                                      {b.threshold}件到達ボーナス
                                    </span>
                                    <span className="text-blue-300">
                                      +{b.points} P
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {streakBonusDetails.length > 0 && (
                            <div>
                              <p className="mt-1 font-semibold text-slate-200">
                                連続出勤ボーナス内訳
                              </p>
                              <ul className="mt-0.5 space-y-0.5">
                                {streakBonusDetails.map((b, idx) => (
                                  <li key={`${b.label}-${idx}`} className="flex justify-between">
                                    <span>{b.label}</span>
                                    <span className="text-blue-300">
                                      +{b.points} P
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 p-3">
              <button
                type="button"
                onClick={handleExportModalDetail}
                disabled={pdfExporting || !monthlySummary[rankingDetailStaffId!]}
                className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-40"
              >
                <FileDown className="h-3.5 w-3.5" />
                PDF保存
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 sm:text-sm"
                onClick={() => setRankingDetailStaffId(null)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 shadow-xl shadow-black/40 ring-1 ring-slate-700">
            <div className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-50 sm:text-base">登録内容の確認</h3>
              <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
                OK を押すと登録されます（キャンセルで戻ります）
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-200 sm:text-xs">
                スタッフ：
                {
                  staffList.find((s) => s.id === selectedStaffId)?.name ??
                  "不明スタッフ"
                }
              </p>
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto px-4 py-3">
              {pendingRecords.map((r, idx) => (
                <div
                  key={`${r.category}-${idx}`}
                  className="flex items-center justify-between rounded-xl bg-slate-950/60 px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-200 sm:text-sm">{r.label}</span>
                    <span className="text-[10px] text-slate-500 sm:text-xs">
                      {r.date.replace(/-/g, "/")}
                    </span>
                  </div>
                  <span className="ml-2 whitespace-nowrap text-xs font-semibold text-blue-300 sm:text-sm">
                    {r.points} P
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-xl bg-slate-800/60 px-3 py-2">
                <span className="text-xs font-medium text-slate-200 sm:text-sm">合計</span>
                <span className="text-xs font-semibold text-slate-50 sm:text-sm">
                  {pendingRecords.reduce((sum, r) => sum + r.points, 0)} P
                </span>
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-800 p-3">
              <button
                type="button"
                className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 active:bg-slate-800 sm:text-sm"
                onClick={() => {
                  setConfirmOpen(false);
                  setPendingRecords([]);
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 active:bg-emerald-700 sm:text-sm"
                onClick={handleConfirmRegister}
              >
                OK（登録）
              </button>
            </div>
          </div>
        </div>
      )}

      {addCastModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 shadow-xl shadow-black/40 ring-1 ring-slate-700">
            <div className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-50">キャスト追加</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">名前を入力して追加してください</p>
            </div>
            <div className="px-4 py-4">
              <input
                type="text"
                value={newCastName}
                onChange={(e) => setNewCastName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCast();
                }}
                placeholder="例: さくら"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-50 outline-none focus:border-blue-500 placeholder:text-slate-500"
                autoFocus
              />
            </div>
            <div className="flex gap-2 border-t border-slate-800 p-3">
              <button
                type="button"
                className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  setAddCastModalOpen(false);
                  setNewCastName("");
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={handleAddCast}
                disabled={!newCastName.trim()}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 shadow-xl shadow-black/50 ring-1 ring-slate-700">
            <div className="border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-50">データリセット</h3>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {resetPinVerified ? "全データを削除します。この操作は取り消せません。" : "暗証番号を入力してください"}
              </p>
            </div>

            {!resetPinVerified ? (
              <div className="px-4 py-4 space-y-3">
                <input
                  type="password"
                  inputMode="numeric"
                  value={resetPin}
                  onChange={(e) => {
                    setResetPin(e.target.value);
                    setResetPinError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleResetPinSubmit();
                  }}
                  placeholder="暗証番号"
                  className={`h-10 w-full rounded-lg border bg-slate-800 px-3 text-sm text-slate-50 outline-none placeholder:text-slate-500 ${
                    resetPinError ? "border-red-500 focus:border-red-400" : "border-slate-700 focus:border-blue-500"
                  }`}
                  autoFocus
                />
                {resetPinError && (
                  <p className="text-xs text-red-400">暗証番号が違います</p>
                )}
              </div>
            ) : (
              <div className="px-4 py-4">
                <div className="rounded-xl bg-emerald-950/50 border border-emerald-900/50 px-3 py-2.5 text-xs text-emerald-300">
                  全キャストのポイント記録がすべて削除されます。キャスト一覧は変わりません。
                </div>
              </div>
            )}

            <div className="flex gap-2 border-t border-slate-800 p-3">
              <button
                type="button"
                className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  setResetModalOpen(false);
                  setResetPin("");
                  setResetPinVerified(false);
                  setResetPinError(false);
                }}
              >
                キャンセル
              </button>
              {!resetPinVerified ? (
                <button
                  type="button"
                  className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={handleResetPinSubmit}
                  disabled={!resetPin.trim()}
                >
                  確認
                </button>
              ) : (
                <button
                  type="button"
                  className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  onClick={handleResetAll}
                >
                  全てをリセット
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {editRecordId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 shadow-xl shadow-black/50 ring-1 ring-slate-700">
            <div className="border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-50">記録を編集</h3>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {editRecordPinVerified ? "内容を修正して保存してください" : "暗証番号を入力してください"}
              </p>
            </div>

            {!editRecordPinVerified ? (
              <div className="px-4 py-4 space-y-2">
                <input
                  type="password"
                  inputMode="numeric"
                  value={editRecordPin}
                  onChange={(e) => { setEditRecordPin(e.target.value); setEditRecordPinError(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEditRecordPinSubmit(); }}
                  placeholder="暗証番号"
                  className={`h-10 w-full rounded-lg border bg-slate-800 px-3 text-sm text-slate-50 outline-none placeholder:text-slate-500 ${
                    editRecordPinError ? "border-red-500 focus:border-red-400" : "border-slate-700 focus:border-blue-500"
                  }`}
                  autoFocus
                />
                {editRecordPinError && (
                  <p className="text-xs text-red-400">暗証番号が違います</p>
                )}
              </div>
            ) : (
              <div className="px-4 py-4 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">日付</label>
                  <input
                    type="date"
                    value={editRecordDate}
                    onChange={(e) => setEditRecordDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">内容</label>
                  <input
                    type="text"
                    value={editRecordLabel}
                    onChange={(e) => setEditRecordLabel(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">ポイント</label>
                  <input
                    type="number"
                    value={editRecordPoints}
                    onChange={(e) =>
                      setEditRecordPoints(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                    min={0}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 border-t border-slate-800 p-3">
              <button
                type="button"
                className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                onClick={() => setEditRecordId(null)}
              >
                キャンセル
              </button>
              {!editRecordPinVerified ? (
                <button
                  type="button"
                  className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={handleEditRecordPinSubmit}
                  disabled={!editRecordPin.trim()}
                >
                  確認
                </button>
              ) : (
                <button
                  type="button"
                  className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={handleSaveRecord}
                  disabled={editRecordPoints === "" || !editRecordLabel.trim() || !editRecordDate}
                >
                  保存
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteCastId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 shadow-xl shadow-black/50 ring-1 ring-slate-700">
            <div className="border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-50">キャスト削除</h3>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                「{staffList.find((s) => s.id === deleteCastId)?.name}」を削除します。
                暗証番号を入力してください。
              </p>
            </div>
            <div className="px-4 py-4 space-y-2">
              <input
                type="password"
                inputMode="numeric"
                value={deleteCastPin}
                onChange={(e) => { setDeleteCastPin(e.target.value); setDeleteCastPinError(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleDeleteCastConfirm(); }}
                placeholder="暗証番号"
                className={`h-10 w-full rounded-lg border bg-slate-800 px-3 text-sm text-slate-50 outline-none placeholder:text-slate-500 ${
                  deleteCastPinError ? "border-red-500 focus:border-red-400" : "border-slate-700 focus:border-blue-500"
                }`}
                autoFocus
              />
              {deleteCastPinError && (
                <p className="text-xs text-red-400">暗証番号が違います</p>
              )}
            </div>
            <div className="flex gap-2 border-t border-slate-800 p-3">
              <button
                type="button"
                className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                onClick={() => { setDeleteCastId(null); setDeleteCastPin(""); setDeleteCastPinError(false); }}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={handleDeleteCastConfirm}
                disabled={!deleteCastPin.trim()}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
