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
      theme: "system",
    },
    relapses: [],
    notes: {},
    xp: 0,
    // Dates Shawn has actively tapped "Mark today clean" on -- separate from
    // the passive/forgiving auto-counted streak. Purely a bonus ritual: XP
    // and fanfare, never required and never clawed back.
    confirmedDays: [],
    // Dates that have already earned the journal-entry XP bonus, so editing
    // a note twice in one day doesn't double-pay it.
    journalXpDates: [],
    // Pet customization: a nickname Shawn can optionally give it, the date it
    // "hatched" (first time this data was ever created, shown in its detail
    // view), plus which unlocked accessory/background are currently equipped
    // ("none" = default).
    petName: "",
    petBirthdate: todayStr(),
    equippedAccessory: "none",
    equippedBackground: "none",
  };
}

let data = loadData();
applyTheme(); // do this immediately (before first paint) to avoid a flash of the wrong theme

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
      xp: Number.isFinite(parsed.xp) ? parsed.xp : 0,
      confirmedDays: Array.isArray(parsed.confirmedDays) ? parsed.confirmedDays.slice().sort() : [],
      journalXpDates: Array.isArray(parsed.journalXpDates) ? parsed.journalXpDates.slice().sort() : [],
      petName: typeof parsed.petName === "string" ? parsed.petName : "",
      petBirthdate: typeof parsed.petBirthdate === "string" ? parsed.petBirthdate : base.petBirthdate,
      equippedAccessory: typeof parsed.equippedAccessory === "string" ? parsed.equippedAccessory : "none",
      equippedBackground: typeof parsed.equippedBackground === "string" ? parsed.equippedBackground : "none",
    };
  } catch (e) {
    console.error("Failed to load data, starting fresh.", e);
    return defaultData();
  }
}

function saveData() {
  data.relapses = Array.from(new Set(data.relapses)).sort();
  data.confirmedDays = Array.from(new Set(data.confirmedDays)).sort();
  data.journalXpDates = Array.from(new Set(data.journalXpDates)).sort();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ---------- theme (light / dark / match device) ---------- */

function applyTheme() {
  const theme = data.settings.theme || "system";
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
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
  // Today doesn't count as a completed clear day until it's actually over --
  // so this is "full days elapsed since start," not an inclusive day count.
  // It advances on its own at midnight since today's date just moves forward.
  return daysBetween(start, today);
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
    // Same "today isn't banked until it's over" rule as currentStreakDays().
    longest = Math.max(longest, daysBetween(prevEnd, today));
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

/* ---------- XP, leveling, and the pet companion ----------
   Tunable knobs -- easy to rebalance later without touching the logic below. */

const XP_CLEAN_DAY = 15; // tapping "Mark today clean" after 8pm
const XP_JOURNAL_ENTRY = 5; // writing a journal note, once per calendar day

// Cumulative XP required to REACH a given level (level 1 starts at 0 XP).
// Grows quadratically so early levels come fast and later ones take longer --
// level 2 at 50xp, level 3 at 150, level 4 at 300, level 5 at 500, etc.
function xpForLevel(level) {
  return 25 * level * (level - 1);
}

function levelForXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

function xpProgress() {
  const xp = data.xp || 0;
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const span = ceil - floor;
  return {
    level,
    xp,
    intoLevel: xp - floor,
    neededForNext: span,
    pct: span > 0 ? Math.min(100, Math.round(((xp - floor) / span) * 100)) : 100,
  };
}

function awardXp(amount) {
  const before = levelForXp(data.xp || 0);
  data.xp = (data.xp || 0) + amount;
  const after = levelForXp(data.xp);
  return { gained: amount, leveledUp: after > before, newLevel: after };
}

// The pet's look evolves in a handful of discrete stages as Shawn (and the
// pet) level up. Each stage is its own hand-drawn inline SVG so there's no
// external art dependency -- see petSvg() below.
const PET_STAGES = [
  { minLevel: 1, key: "egg", name: "Egg" },
  { minLevel: 3, key: "hatchling", name: "Hatchling" },
  { minLevel: 5, key: "sprout", name: "Sprout" },
  { minLevel: 8, key: "adventurer", name: "Adventurer" },
  { minLevel: 12, key: "guardian", name: "Guardian" },
];

function petStageForLevel(level) {
  let stage = PET_STAGES[0];
  for (const s of PET_STAGES) {
    if (level >= s.minLevel) stage = s;
  }
  return stage;
}

// Cosmetic unlocks -- pure flavor, no gameplay effect. "none" is always
// unlocked and is how Shawn un-equips a slot. Nothing unlocks until the egg
// hatches at level 3 -- from there, one new accessory unlocks every single
// level through 15, so there's always something new right around the corner.
const ACCESSORIES = [
  { key: "none", name: "None", minLevel: 1 },
  { key: "bandana", name: "Bandana", minLevel: 3 },
  { key: "shades", name: "Shades", minLevel: 4 },
  { key: "clownnose", name: "Clown Nose", minLevel: 5 },
  { key: "bowtie", name: "Bow Tie", minLevel: 6 },
  { key: "eyepatch", name: "Eye Patch", minLevel: 7 },
  { key: "skimask", name: "Ski Mask", minLevel: 8 },
  { key: "crown", name: "Flower Crown", minLevel: 9 },
  { key: "goggles", name: "Goggles", minLevel: 10 },
  { key: "roundglasses", name: "Round Glasses", minLevel: 11 },
  { key: "catglasses", name: "Cat-Eye Glasses", minLevel: 12 },
  { key: "monocle", name: "Monocle", minLevel: 13 },
  { key: "mustache", name: "Mustache", minLevel: 14 },
  { key: "tophat", name: "Top Hat", minLevel: 15 },
];

const BACKGROUNDS = [
  { key: "none", name: "None", minLevel: 1 },
  { key: "sunrise", name: "Sunrise", minLevel: 3 },
  { key: "meadow", name: "Meadow", minLevel: 5 },
  { key: "stars", name: "Starry Night", minLevel: 7 },
  { key: "aurora", name: "Aurora", minLevel: 10 },
];

function isUnlocked(item, level) {
  return level >= item.minLevel;
}

function isEveningUnlocked() {
  return new Date().getHours() >= 20; // Shawn's phone's local time, no timezone math needed
}

function todayConfirmed() {
  return data.confirmedDays.includes(todayStr());
}

function todayIsSlip() {
  return data.relapses.includes(todayStr());
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
  renderPet();
  renderCleanDayButton();
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
  document.getElementById("heroLabel").textContent = streak === 1 ? "day clean" : "days clean";
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

    if (data.confirmedDays.includes(dateStr)) {
      const star = document.createElement("span");
      star.className = "confirmed-star";
      star.textContent = "★";
      cell.appendChild(star);
    }

    grid.appendChild(cell);
  }
}

/* ---------- pet companion ---------- */

// Rounded, friendly, hand-drawn-in-code creature. Every stage shares the
// same teal/amber palette as the rest of the app; later stages add more
// detail (limbs, ears, a scarf, a glow) rather than becoming a different
// creature, so it reads as one companion growing up.
//
// accessoryKey / backgroundKey are cosmetic unlocks Shawn equips from the
// pet detail view (see ACCESSORIES / BACKGROUNDS above) -- "none" (the
// default) draws nothing extra.
function petSvg(stageKey, accessoryKey, backgroundKey) {
  const bg = backgroundSvg(backgroundKey || "none");
  const acc = accessorySvg(accessoryKey || "none");
  const body = `<ellipse cx="60" cy="70" rx="34" ry="30" fill="var(--teal-500)"/>`;
  const eyes = `<circle cx="49" cy="64" r="4.5" fill="var(--card-bg)"/><circle cx="71" cy="64" r="4.5" fill="var(--card-bg)"/><circle cx="49" cy="64" r="2.2" fill="var(--ink)"/><circle cx="71" cy="64" r="2.2" fill="var(--ink)"/>`;
  const smile = `<path d="M52 76 Q60 82 68 76" stroke="var(--ink)" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  // Face tattoos matching Shawn's own -- two lines above the left eye, a
  // triangle/circle/triangle column above the right eye, and a downward
  // mark under the left eye. Shows on every stage once there's a face to
  // put them on (i.e. not the egg).
  const tattoos = `<g opacity="0.88">
    <line x1="44" y1="46" x2="44" y2="57" stroke="var(--tattoo)" stroke-width="2.6" stroke-linecap="round"/>
    <line x1="49" y1="46" x2="49" y2="57" stroke="var(--tattoo)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M71.5 46 L76.5 46 L74 50.5 Z" fill="none" stroke="var(--tattoo)" stroke-width="1.3"/>
    <path d="M74 49.5 A2.8 2.8 0 1 0 74 55.1" fill="none" stroke="var(--tattoo)" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M71.5 54 L76.5 54 L74 58 Z" fill="none" stroke="var(--tattoo)" stroke-width="1.3"/>
    <path d="M45 70 L52 70 L48.5 77 Z" fill="var(--tattoo)"/>
  </g>`;

  if (stageKey === "egg") {
    return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Egg">
      ${bg}
      <ellipse cx="60" cy="68" rx="30" ry="38" fill="var(--amber-100)" stroke="var(--amber-500)" stroke-width="2.5"/>
      <path d="M50 40 L58 56 L48 60 L64 82" stroke="var(--amber-500)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${acc}
    </svg>`;
  }
  if (stageKey === "hatchling") {
    return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Hatchling">
      ${bg}
      ${body}
      <ellipse cx="30" cy="72" rx="7" ry="10" fill="var(--teal-500)"/>
      <ellipse cx="90" cy="72" rx="7" ry="10" fill="var(--teal-500)"/>
      ${eyes}${smile}${tattoos}${acc}
    </svg>`;
  }
  if (stageKey === "sprout") {
    return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Sprout">
      ${bg}
      <path d="M60 30 Q50 18 40 26 Q48 34 60 38 Z" fill="var(--teal-700)"/>
      <path d="M60 30 Q70 18 80 26 Q72 34 60 38 Z" fill="var(--teal-700)"/>
      ${body}
      <ellipse cx="28" cy="74" rx="8" ry="11" fill="var(--teal-500)"/>
      <ellipse cx="92" cy="74" rx="8" ry="11" fill="var(--teal-500)"/>
      <ellipse cx="45" cy="96" rx="7" ry="9" fill="var(--teal-700)"/>
      <ellipse cx="75" cy="96" rx="7" ry="9" fill="var(--teal-700)"/>
      ${eyes}${smile}${tattoos}${acc}
    </svg>`;
  }
  if (stageKey === "adventurer") {
    return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Adventurer">
      ${bg}
      <path d="M60 28 Q48 14 36 24 Q46 34 60 36 Z" fill="var(--teal-700)"/>
      <path d="M60 28 Q72 14 84 24 Q74 34 60 36 Z" fill="var(--teal-700)"/>
      ${body}
      <path d="M30 66 Q60 78 90 66 L86 84 Q60 92 34 84 Z" fill="var(--amber-500)"/>
      <ellipse cx="26" cy="76" rx="8" ry="11" fill="var(--teal-500)"/>
      <ellipse cx="94" cy="76" rx="8" ry="11" fill="var(--teal-500)"/>
      <ellipse cx="43" cy="98" rx="7.5" ry="9" fill="var(--teal-700)"/>
      <ellipse cx="77" cy="98" rx="7.5" ry="9" fill="var(--teal-700)"/>
      ${eyes}${smile}${tattoos}${acc}
    </svg>`;
  }
  // guardian -- fully evolved, small wings and a sparkle aura
  return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Guardian">
    ${bg}
    <circle cx="60" cy="68" r="46" fill="var(--teal-100)" opacity="0.6"/>
    <path d="M26 60 Q10 62 14 84 Q28 82 34 68 Z" fill="var(--teal-700)"/>
    <path d="M94 60 Q110 62 106 84 Q92 82 86 68 Z" fill="var(--teal-700)"/>
    <path d="M60 26 Q46 10 32 22 Q44 34 60 36 Z" fill="var(--amber-500)"/>
    <path d="M60 26 Q74 10 88 22 Q76 34 60 36 Z" fill="var(--amber-500)"/>
    ${body}
    <path d="M28 66 Q60 80 92 66 L87 88 Q60 98 33 88 Z" fill="var(--amber-500)"/>
    <ellipse cx="24" cy="76" rx="8" ry="11" fill="var(--teal-500)"/>
    <ellipse cx="96" cy="76" rx="8" ry="11" fill="var(--teal-500)"/>
    <ellipse cx="42" cy="99" rx="7.5" ry="9" fill="var(--teal-700)"/>
    <ellipse cx="78" cy="99" rx="7.5" ry="9" fill="var(--teal-700)"/>
    ${eyes}${smile}${tattoos}${acc}
    <path d="M18 34 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="var(--amber-500)"/>
    <path d="M100 44 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="var(--amber-500)"/>
  </svg>`;
}

// Background art, drawn first so it sits behind the creature. Kept to flat
// shapes (no gradients) since several copies of this SVG can be on screen
// at once (home card + every option tile in the unlock grid) and duplicate
// gradient ids across inline SVGs can misbehave.
function backgroundSvg(key) {
  if (key === "sunrise") {
    return `<circle cx="60" cy="58" r="50" fill="var(--amber-100)" opacity="0.7"/><path d="M4 96 Q60 76 116 96 L116 120 L4 120 Z" fill="var(--teal-100)" opacity="0.8"/>`;
  }
  if (key === "meadow") {
    return `<path d="M0 96 Q30 84 60 96 T120 96 L120 120 L0 120 Z" fill="var(--teal-100)"/><circle cx="20" cy="100" r="3" fill="var(--amber-500)"/><circle cx="100" cy="102" r="3" fill="var(--amber-500)"/><circle cx="36" cy="107" r="2.2" fill="var(--teal-700)"/><circle cx="88" cy="108" r="2.2" fill="var(--teal-700)"/>`;
  }
  if (key === "stars") {
    return `<rect x="0" y="0" width="120" height="120" fill="var(--teal-900)" opacity="0.16"/><circle cx="18" cy="22" r="1.7" fill="var(--amber-500)"/><circle cx="100" cy="18" r="1.4" fill="var(--amber-500)"/><circle cx="30" cy="102" r="1.4" fill="var(--amber-500)"/><circle cx="106" cy="96" r="1.7" fill="var(--amber-500)"/><circle cx="12" cy="70" r="1.3" fill="var(--amber-500)"/>`;
  }
  if (key === "aurora") {
    return `<circle cx="60" cy="60" r="54" fill="var(--teal-100)" opacity="0.5"/><path d="M6 48 Q60 18 114 48" stroke="var(--amber-500)" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/><path d="M6 60 Q60 32 114 60" stroke="var(--teal-700)" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>`;
  }
  return ""; // none
}

// Accessory art, drawn last so it sits on top of the creature (shades,
// goggles, etc. in particular need to cover the plain eye circles beneath
// them). Deliberately flat colors -- see the no-gradients note above.
function accessorySvg(key) {
  if (key === "bandana") {
    return `<path d="M36 86 Q60 100 84 86 L78 98 Q60 106 42 98 Z" fill="var(--amber-500)"/><circle cx="60" cy="94" r="2.4" fill="var(--amber-100)"/>`;
  }
  if (key === "shades") {
    return `<rect x="42" y="59" width="16" height="10" rx="4" fill="var(--ink)"/><rect x="62" y="59" width="16" height="10" rx="4" fill="var(--ink)"/><line x1="58" y1="63" x2="62" y2="63" stroke="var(--ink)" stroke-width="2"/>`;
  }
  if (key === "clownnose") {
    return `<circle cx="60" cy="71" r="6.5" fill="#d64b3a"/><circle cx="57.5" cy="68.5" r="1.6" fill="#f2a898" opacity="0.8"/>`;
  }
  if (key === "bowtie") {
    return `<path d="M52 84 L60 88 L52 92 Z" fill="var(--amber-500)"/><path d="M68 84 L60 88 L68 92 Z" fill="var(--amber-500)"/><circle cx="60" cy="88" r="2" fill="var(--amber-100)"/>`;
  }
  if (key === "eyepatch") {
    return `<path d="M40 58 L58 55 L58 72 L41 70 Z" fill="var(--ink)"/><line x1="41" y1="60" x2="20" y2="50" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/><line x1="41" y1="66" x2="20" y2="74" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>`;
  }
  if (key === "skimask") {
    return `<path d="M26 44 Q60 24 94 44 L94 84 Q60 100 26 84 Z" fill="var(--ink)"/><circle cx="49" cy="64" r="6" fill="var(--card-bg)" opacity="0.9"/><circle cx="71" cy="64" r="6" fill="var(--card-bg)" opacity="0.9"/><path d="M52 78 Q60 84 68 78" stroke="var(--card-bg)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.9"/>`;
  }
  if (key === "crown") {
    return `<path d="M44 40 L48 30 L54 38 L60 28 L66 38 L72 30 L76 40 Z" fill="var(--amber-500)"/><circle cx="48" cy="30" r="1.8" fill="var(--teal-700)"/><circle cx="60" cy="28" r="1.8" fill="var(--teal-700)"/><circle cx="72" cy="30" r="1.8" fill="var(--teal-700)"/>`;
  }
  if (key === "goggles") {
    return `<circle cx="49" cy="64" r="9" fill="var(--card-bg)" stroke="var(--amber-500)" stroke-width="2.5"/><circle cx="71" cy="64" r="9" fill="var(--card-bg)" stroke="var(--amber-500)" stroke-width="2.5"/><line x1="58" y1="64" x2="62" y2="64" stroke="var(--amber-500)" stroke-width="2.5"/><line x1="40" y1="59" x2="30" y2="52" stroke="var(--amber-500)" stroke-width="2" stroke-linecap="round"/><line x1="80" y1="59" x2="90" y2="52" stroke="var(--amber-500)" stroke-width="2" stroke-linecap="round"/>`;
  }
  if (key === "roundglasses") {
    return `<circle cx="49" cy="64" r="7" fill="none" stroke="var(--ink)" stroke-width="1.6"/><circle cx="71" cy="64" r="7" fill="none" stroke="var(--ink)" stroke-width="1.6"/><line x1="56" y1="64" x2="64" y2="64" stroke="var(--ink)" stroke-width="1.6"/>`;
  }
  if (key === "catglasses") {
    return `<path d="M41 61 Q49 55 59 63 Q49 70 41 68 Z" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round"/><path d="M79 61 Q71 55 61 63 Q71 70 79 68 Z" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round"/><line x1="59" y1="63" x2="61" y2="63" stroke="var(--ink)" stroke-width="1.8"/>`;
  }
  if (key === "monocle") {
    return `<circle cx="71" cy="64" r="7" fill="none" stroke="var(--amber-500)" stroke-width="1.8"/><path d="M77.5 70 Q83 78 78 87" stroke="var(--amber-500)" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  }
  if (key === "mustache") {
    return `<path d="M45 74 Q52 69 60 74 Q68 69 75 74 Q68 79 60 75.5 Q52 79 45 74 Z" fill="var(--ink)"/>`;
  }
  if (key === "tophat") {
    return `<rect x="46" y="12" width="28" height="20" rx="2" fill="var(--ink)"/><rect x="39" y="30" width="42" height="6" rx="2" fill="var(--ink)"/><rect x="46" y="25" width="28" height="4" fill="var(--amber-500)"/>`;
  }
  return ""; // none
}

// Shown in the unlock grid in place of an item's real art until it's
// unlocked -- Shawn shouldn't get a preview of what's coming, just a hint
// that something is waiting at that level.
function mysteryPreviewSvg() {
  return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Locked">
    <ellipse cx="60" cy="70" rx="34" ry="30" fill="var(--border)"/>
    <text x="60" y="80" text-anchor="middle" font-size="34" font-weight="700" fill="var(--ink-soft)">?</text>
  </svg>`;
}

function renderPet() {
  const { level, intoLevel, neededForNext, pct } = xpProgress();
  const stage = petStageForLevel(level);
  document.getElementById("petArt").innerHTML = petSvg(stage.key, data.equippedAccessory, data.equippedBackground);
  document.getElementById("petStageName").textContent = stage.name;
  document.getElementById("petLevel").textContent = `Level ${level}`;
  document.getElementById("petXpBarFill").style.width = `${pct}%`;
  document.getElementById("petXpLabel").textContent = `${intoLevel} / ${neededForNext} XP to next level`;
}

/* ---------- pet detail modal (name, birthdate, accessory/background unlocks) ---------- */

function openPetModal() {
  renderPetModal();
  document.getElementById("petModal").classList.remove("hidden");
}

function closePetModal() {
  document.getElementById("petModal").classList.add("hidden");
}

function renderPetModal() {
  const { level, intoLevel, neededForNext, pct } = xpProgress();
  const stage = petStageForLevel(level);

  document.getElementById("petModalArt").innerHTML = petSvg(stage.key, data.equippedAccessory, data.equippedBackground);

  const nameInput = document.getElementById("petNameInput");
  if (document.activeElement !== nameInput) {
    nameInput.value = data.petName || "";
  }

  document.getElementById("petModalStageLevel").textContent = `${stage.name} · Level ${level}`;
  document.getElementById("petModalXpBarFill").style.width = `${pct}%`;
  document.getElementById("petModalXpLabel").textContent = `${intoLevel} / ${neededForNext} XP to next level`;
  document.getElementById("petModalBirthdate").textContent = `Hatched ${formatPretty(data.petBirthdate || todayStr())}`;

  renderPetUnlockGrid("accessory");
  renderPetUnlockGrid("background");
}

function renderPetUnlockGrid(kind) {
  const isAccessory = kind === "accessory";
  const items = isAccessory ? ACCESSORIES : BACKGROUNDS;
  const equippedKey = isAccessory ? data.equippedAccessory : data.equippedBackground;
  const container = document.getElementById(isAccessory ? "petAccessoryGrid" : "petBackgroundGrid");
  const { level } = xpProgress();
  const stage = petStageForLevel(level);

  container.innerHTML = "";
  items.forEach((item) => {
    const unlocked = isUnlocked(item, level);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "pet-unlock-item";
    if (!unlocked) tile.classList.add("locked");
    if (equippedKey === item.key) tile.classList.add("equipped");

    // Locked items stay a surprise -- no preview of what they look like on
    // the pet, and no name reveal, just a "?" placeholder and the level
    // they unlock at.
    const previewArt = !unlocked
      ? mysteryPreviewSvg()
      : isAccessory
      ? petSvg(stage.key, item.key, data.equippedBackground)
      : petSvg(stage.key, data.equippedAccessory, item.key);
    const displayName = unlocked ? item.name : "???";

    tile.innerHTML = `
      <div class="pet-unlock-preview">${previewArt}</div>
      <span class="pet-unlock-name">${displayName}</span>
      <span class="pet-unlock-sub">${unlocked ? (equippedKey === item.key ? "Equipped" : "") : `Unlocks at level ${item.minLevel}`}</span>
    `;
    if (unlocked) {
      tile.addEventListener("click", () => equipItem(kind, item.key));
    } else {
      tile.disabled = true;
    }
    container.appendChild(tile);
  });
}

function equipItem(kind, key) {
  const items = kind === "accessory" ? ACCESSORIES : BACKGROUNDS;
  const item = items.find((i) => i.key === key);
  const { level } = xpProgress();
  if (!item || !isUnlocked(item, level)) return;

  if (kind === "accessory") {
    data.equippedAccessory = key;
  } else {
    data.equippedBackground = key;
  }
  saveData();
  renderPet();
  renderPetModal();
}

function savePetName() {
  const input = document.getElementById("petNameInput");
  const name = input.value.trim().slice(0, 24);
  data.petName = name;
  saveData();
}

function renderCleanDayButton() {
  const btn = document.getElementById("markCleanBtn");
  const badge = document.getElementById("todayConfirmedBadge");
  if (!btn || !badge) return;

  const hasStarted = !!data.settings.quitDate;
  const unlocked = isEveningUnlocked();
  const confirmed = todayConfirmed();
  const isSlip = todayIsSlip();

  if (!hasStarted || isSlip) {
    btn.classList.add("hidden");
    badge.classList.add("hidden");
    return;
  }

  if (confirmed) {
    btn.classList.add("hidden");
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    btn.classList.remove("hidden");
    btn.disabled = !unlocked;
    btn.textContent = unlocked ? "Mark today clean 🌟" : "Mark today clean (unlocks at 8pm)";
  }
}

function handleMarkCleanDay() {
  if (!isEveningUnlocked() || todayConfirmed() || todayIsSlip()) return;
  const today = todayStr();
  data.confirmedDays.push(today);
  const result = awardXp(XP_CLEAN_DAY);
  saveData();
  renderCleanDayButton();
  renderPet();
  renderCalendar();
  openFanfareModal(result);
}

function openFanfareModal(result) {
  document.getElementById("fanfareXpLine").textContent = `+${result.gained} XP for today`;
  document.getElementById("fanfareLevelUp").classList.toggle("hidden", !result.leveledUp);
  if (result.leveledUp) {
    document.getElementById("fanfareLevelUp").textContent = `Level up! ${result.newLevel}`;
  }
  document.getElementById("fanfareModal").classList.remove("hidden");
}

function closeFanfareModal() {
  document.getElementById("fanfareModal").classList.add("hidden");
}

/* ---------- modals ---------- */

function openDayModal(dateStr) {
  const modal = document.getElementById("dayModal");
  document.getElementById("dayModalDate").textContent = formatPretty(dateStr);
  const isSlip = data.relapses.includes(dateStr);
  document.getElementById("dayModalStatus").textContent = isSlip ? "Marked as a slip" : "Clean day";
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
  document.getElementById("settingsTheme").value = data.settings.theme || "system";
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
  document.getElementById("markCleanBtn").addEventListener("click", handleMarkCleanDay);

  // Fanfare modal
  document.getElementById("fanfareClose").addEventListener("click", closeFanfareModal);
  document.getElementById("fanfareModal").addEventListener("click", (e) => {
    if (e.target.id === "fanfareModal") closeFanfareModal();
  });
  document.getElementById("fanfareNotNowBtn").addEventListener("click", closeFanfareModal);
  document.getElementById("fanfareJournalBtn").addEventListener("click", () => {
    closeFanfareModal();
    openDayModal(todayStr());
  });

  // Pet card / pet detail modal
  document.getElementById("petCard").addEventListener("click", openPetModal);
  document.getElementById("petCard").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPetModal();
    }
  });
  document.getElementById("petModalClose").addEventListener("click", closePetModal);
  document.getElementById("petModal").addEventListener("click", (e) => {
    if (e.target.id === "petModal") closePetModal();
  });
  document.getElementById("petNameInput").addEventListener("change", savePetName);
  document.getElementById("petNameInput").addEventListener("blur", savePetName);

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
    // Journal XP is a one-time bonus per calendar day, awarded the first
    // time a non-empty note lands on that date -- editing it later doesn't
    // pay out again.
    let leveledResult = null;
    if (note && !data.journalXpDates.includes(dateStr)) {
      data.journalXpDates.push(dateStr);
      leveledResult = awardXp(XP_JOURNAL_ENTRY);
    }
    saveData();
    closeDayModal();
    renderCalendar();
    renderPet();
    if (leveledResult) openFanfareModal(leveledResult);
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
  document.getElementById("checkUpdateBtn").addEventListener("click", checkForUpdate);

  // Theme applies (and saves) the instant it's changed, rather than waiting
  // for "Save settings" -- so switching it feels immediate.
  document.getElementById("settingsTheme").addEventListener("change", (e) => {
    data.settings.theme = e.target.value;
    saveData();
    applyTheme();
  });
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
        xp: Number.isFinite(parsed.xp) ? parsed.xp : 0,
        confirmedDays: Array.isArray(parsed.confirmedDays) ? parsed.confirmedDays.slice().sort() : [],
        journalXpDates: Array.isArray(parsed.journalXpDates) ? parsed.journalXpDates.slice().sort() : [],
        petName: typeof parsed.petName === "string" ? parsed.petName : "",
        petBirthdate: typeof parsed.petBirthdate === "string" ? parsed.petBirthdate : base.petBirthdate,
        equippedAccessory: typeof parsed.equippedAccessory === "string" ? parsed.equippedAccessory : "none",
        equippedBackground: typeof parsed.equippedBackground === "string" ? parsed.equippedBackground : "none",
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

    // sw.js calls self.skipWaiting() + self.clients.claim(), so a new version
    // takes control the moment it's ready -- no separate "install" prompt.
    // Only reload automatically when *this* takes control after the person
    // taps "Check for updates" below; a silent background update (the browser
    // does its own periodic checks) shouldn't yank the page out from under
    // someone mid-note.
    let hasReloadedForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!userRequestedUpdate || hasReloadedForUpdate) return;
      hasReloadedForUpdate = true;
      window.location.reload();
    });
  }
}

let userRequestedUpdate = false;

function checkForUpdate() {
  const statusEl = document.getElementById("updateStatus");
  const btn = document.getElementById("checkUpdateBtn");
  if (!statusEl || !btn) return;

  if (!("serviceWorker" in navigator)) {
    statusEl.textContent = "Not supported in this browser.";
    return;
  }

  btn.disabled = true;
  statusEl.textContent = "Checking…";

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) {
      statusEl.textContent = "Couldn't check -- try closing and reopening the app.";
      btn.disabled = false;
      return;
    }
    userRequestedUpdate = true;
    reg
      .update()
      .then(() => {
        // If an update was found, sw.js installs and activates it right away,
        // which fires "controllerchange" above and reloads the page. If
        // nothing happens in a few seconds, there was nothing new.
        setTimeout(() => {
          statusEl.textContent = "You're on the latest version.";
          btn.disabled = false;
          userRequestedUpdate = false;
        }, 3000);
      })
      .catch(() => {
        statusEl.textContent = "Couldn't check for updates -- check your connection.";
        btn.disabled = false;
        userRequestedUpdate = false;
      });
  });
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
      // Was hardcoded to "/" (site root), which is wrong for a GitHub Pages
      // *project* site living at /fukratom/ -- sw.js actually registers with
      // a scope of whatever folder it's served from, so this has to match
      // that instead of assuming root. Computing it from the current page
      // means this keeps working if the app ever moves (custom domain, a
      // different subpath, etc).
      serviceWorkerParam: { scope: new URL(".", location.href).pathname },
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
