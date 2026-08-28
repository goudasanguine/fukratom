/* Fuck Kratom — a private, local-only sobriety tracker.
   All data lives in this browser's localStorage. Nothing is sent anywhere. */

const STORAGE_KEY = "clearDaysData_v1";

const MILESTONES = [
  { days: 1, label: "1 Day" },
  { days: 3, label: "3 Days" },
  { days: 7, label: "1 Week" },
  { days: 14, label: "2 Weeks" },
  { days: 30, label: "1 Month" },
  { days: 60, label: "2 Months" },
  { days: 90, label: "3 Months" },
  { days: 180, label: "6 Months" },
  { days: 365, label: "1 Year" },
  { days: 545, label: "18 Months" },
  { days: 730, label: "2 Years" },
];

/* ---------- date helpers (all local-time, string based: "YYYY-MM-DD") ---------- */

function todayStr() {
  return dateToStr(new Date());
}
function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function strToDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = strToDate(s);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}
function daysBetween(aStr, bStr) {
  const a = strToDate(aStr);
  const b = strToDate(bStr);
  return Math.round((b - a) / 86400000);
}
function formatPretty(s) {
  return strToDate(s).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ---------- data layer ---------- */

function defaultData() {
  return {
    settings: {
      appName: "Fuck Kratom",
      subtitle: "kratom-free tracker",
      quitDate: null,
      reason: "",
      dailyCost: 45,
    },
    relapses: [],
    notes: {},
  };
}

let data = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const base = defaultData();
    return {
      settings: Object.assign({}, base.settings, parsed.settings || {}),
      relapses: Array.isArray(parsed.relapses) ? parsed.relapses.slice().sort() : [],
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
    };
  } catch (e) {
    console.error("Failed to load data, starting fresh.", e);
    return defaultData();
  }
}

function saveData() {
  data.relapses = Array.from(new Set(data.relapses)).sort();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ---------- streak math ---------- */

function currentStreakStart() {
  if (data.relapses.length > 0) {
    return addDays(data.relapses[data.relapses.length - 1], 1);
  }
  return data.settings.quitDate;
}

function currentStreakDays() {
  if (!data.settings.quitDate) return 0;
  const start = currentStreakStart();
  const today = todayStr();
  if (start > today) return 0;
  return daysBetween(start, today) + 1;
}

function longestStreakDays() {
  if (!data.settings.quitDate) return 0;
  const today = todayStr();
  let prevEnd = data.settings.quitDate;
  let longest = 0;
  for (const relapse of data.relapses) {
    const intervalEnd = addDays(relapse, -1);
    if (intervalEnd >= prevEnd) {
      longest = Math.max(longest, daysBetween(prevEnd, intervalEnd) + 1);
    }
    prevEnd = addDays(relapse, 1);
  }
  if (prevEnd <= today) {
    longest = Math.max(longest, daysBetween(prevEnd, today) + 1);
  }
  return longest;
}

function totalClearDays() {
  if (!data.settings.quitDate) return 0;
  const today = todayStr();
  if (data.settings.quitDate > today) return 0;
  const span = daysBetween(data.settings.quitDate, today) + 1;
  const relapsesInRange = data.relapses.filter(
    (r) => r >= data.settings.quitDate && r <= today
  ).length;
  return Math.max(0, span - relapsesInRange);
}

function moneySaved() {
  const dailyCost = Number(data.settings.dailyCost) || 0;
  return Math.round(totalClearDays() * dailyCost);
}

/* ---------- rendering ---------- */

let calYear, calMonth; // 0-indexed month, currently displayed

function init() {
  const t = strToDate(todayStr());
  calYear = t.getFullYear();
  calMonth = t.getMonth();

  wireEvents();
  registerServiceWorker();
  initOneSignal();
  renderAll();
}

function renderAll() {
  const hasStarted = !!data.settings.quitDate;
  document.getElementById("setupCard").classList.toggle("hidden", hasStarted);
  document.getElementById("appBody").classList.toggle("hidden", !hasStarted);
  if (!hasStarted) return;

  renderHeader();
  renderHero();
  renderMoney();
  renderStats();
  renderMilestones();
  renderCalendar();
}

function renderHeader() {
  document.getElementById("appName").textContent = data.settings.appName || "Fuck Kratom";
  document.getElementById("appSubtitle").textContent = data.settings.subtitle || "";
}

function renderHero() {
  const streak = currentStreakDays();
  document.getElementById("heroDays").textContent = streak;
  document.getElementById("heroLabel").textContent = streak === 1 ? "day clear" : "days clear";
  const start = currentStreakStart();
  document.getElementById("heroSince").textContent =
    streak > 0 || start <= todayStr()
      ? `Since ${formatPretty(start)}`
      : "Your streak starts today";
  document.getElementById("heroReason").textContent = data.settings.reason || "";
}

function renderMoney() {
  const amount = moneySaved();
  document.getElementById("moneySaved").textContent = `$${amount.toLocaleString()}`;
  const rate = Number(data.settings.dailyCost) || 0;
  document.getElementById("moneyNote").textContent = `Based on $${rate}/day not spent on kratom`;
}

function renderStats() {
  document.getElementById("statLongest").textContent = longestStreakDays();
  document.getElementById("statTotal").textContent = totalClearDays();
  document.getElementById("statSlips").textContent = data.relapses.length;
}

function renderMilestones() {
  const streak = currentStreakDays();
  const el = document.getElementById("milestones");
  el.innerHTML = "";
  let nextShown = false;
  for (const m of MILESTONES) {
    const reached = streak >= m.days;
    const div = document.createElement("div");
    div.className = "milestone" + (reached ? " reached" : "");
    const sub = reached
      ? "reached"
      : !nextShown
      ? `${m.days - streak} to go`
      : "";
    if (!reached) nextShown = true;
    div.innerHTML = `
      <div class="milestone-icon">${reached ? "✅" : "⏳"}</div>
      <div class="milestone-label">${m.label}</div>
      <div class="milestone-sub">${sub}</div>
    `;
    el.appendChild(div);
  }
}

function renderCalendar() {
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  document.getElementById("calMonthLabel").textContent = monthLabel;

  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";

  const firstOfMonth = new Date(calYear, calMonth, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayStr();
  const quitDate = data.settings.quitDate;

  for (let i = 0; i < startWeekday; i++) {
    const filler = document.createElement("div");
    filler.className = "cal-day empty";
    grid.appendChild(filler);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateToStr(new Date(calYear, calMonth, day));
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = String(day);

    const isSlip = data.relapses.includes(dateStr);
    const isFuture = dateStr > today;
    const isBeforeStart = quitDate && dateStr < quitDate;

    if (isBeforeStart) {
      cell.classList.add("before-start");
    } else if (isFuture) {
      cell.classList.add("future");
    } else if (isSlip) {
      cell.classList.add("slip");
    } else {
      cell.classList.add("clear");
    }
    if (dateStr === today) cell.classList.add("today");

    if (data.notes[dateStr]) {
      const dot = document.createElement("span");
      dot.className = "note-dot";
      cell.appendChild(dot);
    }

    if (!isFuture && !isBeforeStart) {
      cell.addEventListener("click", () => openDayModal(dateStr));
    }

    grid.appendChild(cell);
  }
}

/* ---------- modals ---------- */

function openDayModal(dateStr) {
  const modal = document.getElementById("dayModal");
  document.getElementById("dayModalDate").textContent = formatPretty(dateStr);
  const isSlip = data.relapses.includes(dateStr);
  document.getElementById("dayModalStatus").textContent = isSlip ? "Marked as a slip" : "Clear day";
  document.getElementById("dayModalNote").value = data.notes[dateStr] || "";
  const toggleBtn = document.getElementById("dayModalToggleSlip");
  toggleBtn.textContent = isSlip ? "Remove slip mark" : "Mark this day as a slip";

  modal.dataset.date = dateStr;
  modal.classList.remove("hidden");
}

function closeDayModal() {
  document.getElementById("dayModal").classList.add("hidden");
}

function openSlipModal(defaultDate) {
  const input = document.getElementById("slipDate");
  input.value = defaultDate || todayStr();
  input.min = data.settings.quitDate || "";
  input.max = todayStr();
  document.getElementById("slipModal").classList.remove("hidden");
}

function closeSlipModal() {
  document.getElementById("slipModal").classList.add("hidden");
}

function openSettingsModal() {
  document.getElementById("settingsAppName").value = data.settings.appName || "";
  document.getElementById("settingsSubtitle").value = data.settings.subtitle || "";
  document.getElementById("settingsQuitDate").value = data.settings.quitDate || "";
  document.getElementById("settingsQuitDate").max = todayStr();
  document.getElementById("settingsReason").value = data.settings.reason || "";
  document.getElementById("settingsDailyCost").value = data.settings.dailyCost;
  document.getElementById("settingsModal").classList.remove("hidden");
  updateNotifStatus();
}

function closeSettingsModal() {
  document.getElementById("settingsModal").classList.add("hidden");
}

/* ---------- events ---------- */

function wireEvents() {
  document.getElementById("setupSaveBtn").addEventListener("click", () => {
    const dateVal = document.getElementById("setupDate").value || todayStr();
    data.settings.quitDate = dateVal;
    data.settings.reason = document.getElementById("setupReason").value.trim();
    saveData();
    renderAll();
  });

  document.getElementById("logSlipBtn").addEventListener("click", () => openSlipModal(todayStr()));
  document.getElementById("addNoteBtn").addEventListener("click", () => openDayModal(todayStr()));

  document.getElementById("prevMonth").addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById("nextMonth").addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  // Day modal
  document.getElementById("dayModalClose").addEventListener("click", closeDayModal);
  document.getElementById("dayModal").addEventListener("click", (e) => {
    if (e.target.id === "dayModal") closeDayModal();
  });
  document.getElementById("dayModalToggleSlip").addEventListener("click", () => {
    const dateStr = document.getElementById("dayModal").dataset.date;
    const idx = data.relapses.indexOf(dateStr);
    if (idx === -1) data.relapses.push(dateStr);
    else data.relapses.splice(idx, 1);
    saveData();
    openDayModal(dateStr); // refresh modal contents
    renderHero(); renderStats(); renderMilestones(); renderCalendar();
  });
  document.getElementById("dayModalSave").addEventListener("click", () => {
    const dateStr = document.getElementById("dayModal").dataset.date;
    const note = document.getElementById("dayModalNote").value.trim();
    if (note) data.notes[dateStr] = note;
    else delete data.notes[dateStr];
    saveData();
    closeDayModal();
    renderCalendar();
  });

  // Slip modal
  document.getElementById("slipModalClose").addEventListener("click", closeSlipModal);
  document.getElementById("slipCancelBtn").addEventListener("click", closeSlipModal);
  document.getElementById("slipModal").addEventListener("click", (e) => {
    if (e.target.id === "slipModal") closeSlipModal();
  });
  document.getElementById("slipConfirmBtn").addEventListener("click", () => {
    const dateStr = document.getElementById("slipDate").value;
    if (!dateStr) return;
    if (!data.relapses.includes(dateStr)) data.relapses.push(dateStr);
    saveData();
    closeSlipModal();
    renderAll();
  });

  // Settings modal
  document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("settingsModalClose").addEventListener("click", closeSettingsModal);
  document.getElementById("settingsModal").addEventListener("click", (e) => {
    if (e.target.id === "settingsModal") closeSettingsModal();
  });
  document.getElementById("settingsSaveBtn").addEventListener("click", () => {
    const newQuitDate = document.getElementById("settingsQuitDate").value;
    data.settings.appName = document.getElementById("settingsAppName").value.trim() || "Fuck Kratom";
    data.settings.subtitle = document.getElementById("settingsSubtitle").value.trim();
    data.settings.reason = document.getElementById("settingsReason").value.trim();
    const costInput = parseFloat(document.getElementById("settingsDailyCost").value);
    data.settings.dailyCost = Number.isFinite(costInput) && costInput >= 0 ? costInput : 45;
    if (newQuitDate) {
      data.settings.quitDate = newQuitDate;
      data.relapses = data.relapses.filter((r) => r >= newQuitDate);
    }
    saveData();
    closeSettingsModal();
    renderAll();
  });

  document.getElementById("exportBtn").addEventListener("click", exportBackup);
  document.getElementById("importInput").addEventListener("change", importBackup);
  document.getElementById("resetBtn").addEventListener("click", resetAllData);

  document.getElementById("enableNotifsBtn").addEventListener("click", requestNotifPermission);
}

/* ---------- backup / restore ---------- */

function exportBackup() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuck-kratom-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const base = defaultData();
      data = {
        settings: Object.assign({}, base.settings, parsed.settings || {}),
        relapses: Array.isArray(parsed.relapses) ? parsed.relapses.slice().sort() : [],
        notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      };
      saveData();
      closeSettingsModal();
      renderAll();
      alert("Backup imported.");
    } catch (err) {
      alert("That file couldn't be read as a Fuck Kratom backup.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function resetAllData() {
  if (!confirm("This erases all tracked days, notes, and settings on this device. This can't be undone. Continue?")) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  data = defaultData();
  closeSettingsModal();
  renderAll();
}

/* ---------- PWA ---------- */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    // Relative path so this works whether the app is hosted at the domain root
    // or in a GitHub Pages project subpath.
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

/* ---------- push notifications (OneSignal) ----------
   Set this after creating your free OneSignal app (dashboard -> Settings ->
   Keys & IDs). This ID is public/safe to have in this committed file -- it's
   not a secret, unlike the REST API key used in the GitHub Action. */

const ONESIGNAL_APP_ID = "cc982374-7353-4a4f-89b2-65775b18a3a4";

function oneSignalConfigured() {
  return !!ONESIGNAL_APP_ID && !ONESIGNAL_APP_ID.startsWith("YOUR_");
}

function initOneSignal() {
  if (!oneSignalConfigured()) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerPath: "sw.js",
      serviceWorkerParam: { scope: "/" },
    });
    OneSignal.User.PushSubscription.addEventListener("change", updateNotifStatus);
    updateNotifStatus();
  });
}

function requestNotifPermission() {
  if (!oneSignalConfigured()) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.Notifications.requestPermission();
    updateNotifStatus();
  });
}

function updateNotifStatus() {
  const statusEl = document.getElementById("notifStatus");
  const btn = document.getElementById("enableNotifsBtn");
  if (!statusEl || !btn) return;

  if (!oneSignalConfigured()) {
    statusEl.textContent = "Not set up yet — see README.md.";
    btn.disabled = true;
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    const optedIn = OneSignal.User.PushSubscription.optedIn;
    statusEl.textContent = optedIn ? "Notifications are on for this phone." : "Notifications are off.";
    btn.textContent = optedIn ? "Notifications enabled" : "Enable notifications";
    btn.disabled = !!optedIn;
  });
}

document.addEventListener("DOMContentLoaded", init);
