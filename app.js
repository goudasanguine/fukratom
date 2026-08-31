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
    // Dates Shawn has tapped the morning/afternoon pledge button on (before
    // 8pm, before that day's "Mark today clean" even unlocks). One-time
    // per day, no catch-up if skipped -- unlike confirmedDays below.
    pledgedDays: [],
    // Dates that have already earned the journal-entry XP bonus, so editing
    // a note twice in one day doesn't double-pay it.
    journalXpDates: [],
    // Dates that were clean but never actively confirmed via "Mark today
    // clean" -- these still count toward the streak either way (it's always
    // been fully automatic), but once a day like this is fully in the past
    // it quietly gets half of confirmedDays' XP instead of none, so a
    // forgotten evening doesn't cost the pet all its XP for that day. See
    // processPastCleanDays(). Tracked separately so a day is never paid out
    // twice (once here, once if Shawn later confirms -- confirming only
    // applies to *today*, so that overlap can't actually happen, but this
    // keeps the two payout paths cleanly distinguishable either way).
    autoXpDates: [],
    // True once the one-time launch-day XP reset (applyLaunchXpReset) has
    // run for this save data. Defaults true here because a brand-new install
    // starts at 0 XP anyway and has nothing to reset -- it's loadData() below
    // that treats *existing* saved data missing this field as needing the
    // reset, since the field didn't exist before this system shipped.
    xpResetApplied: true,
    // Pet customization: a nickname Shawn can optionally give it, plus which
    // unlocked accessory/background are currently equipped ("none" = no
    // accessory equipped; equippedBackground defaults to "sunrise", not
    // "none", so a brand-new install starts on the trashed beach rather than
    // the plain flat --bg -- see backgroundSvgTall()'s own sunrise/cleanbeach
    // notes for why that's the level-1 default scene).
    petName: "",
    // The date the pet actually hatched out of its egg (reached level 3) --
    // null while it's still an egg. Set once, the moment it happens, by
    // awardXp() below. Not the date the save data was created.
    petBirthdate: null,
    equippedAccessory: "none",
    equippedBackground: "sunrise",
    // Cosmetics unlocked by DOING something once, rather than by level --
    // see the "unlock" descriptor on ACCESSORIES/BACKGROUNDS items below.
    // Each flips true forever the first time that action happens and never
    // goes back, regardless of level.
    eventUnlocks: {
      firstJournal: false, // unlocks the Sakura Garden background
      firstPledge: false, // unlocks the Green Knoll background
      firstMarkClean: false, // unlocks the "Hi, My Name Is..." badge accessory
    },
  };
}

let data = loadData();
applyTheme(); // do this immediately (before first paint) to avoid a flash of the wrong theme

// Shared by loadData() and importBackup() so the two can't drift. Missing/
// malformed input just means "not unlocked yet" for that one -- never throws.
function parseEventUnlocks(parsed) {
  const src = parsed && typeof parsed === "object" ? parsed : {};
  return {
    firstJournal: !!src.firstJournal,
    firstPledge: !!src.firstPledge,
    firstMarkClean: !!src.firstMarkClean,
  };
}

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
      pledgedDays: Array.isArray(parsed.pledgedDays) ? parsed.pledgedDays.slice().sort() : [],
      journalXpDates: Array.isArray(parsed.journalXpDates) ? parsed.journalXpDates.slice().sort() : [],
      autoXpDates: Array.isArray(parsed.autoXpDates) ? parsed.autoXpDates.slice().sort() : [],
      // Missing on any save data from before this field existed -- i.e.
      // every real existing user -- so it defaults to false (not yet
      // applied) here, unlike defaultData()'s true. See applyLaunchXpReset().
      xpResetApplied: typeof parsed.xpResetApplied === "boolean" ? parsed.xpResetApplied : false,
      petName: typeof parsed.petName === "string" ? parsed.petName : "",
      petBirthdate: typeof parsed.petBirthdate === "string" ? parsed.petBirthdate : null,
      equippedAccessory: typeof parsed.equippedAccessory === "string" ? parsed.equippedAccessory : "none",
      equippedBackground: typeof parsed.equippedBackground === "string" ? parsed.equippedBackground : "sunrise",
      eventUnlocks: parseEventUnlocks(parsed.eventUnlocks),
    };
  } catch (e) {
    console.error("Failed to load data, starting fresh.", e);
    return defaultData();
  }
}

// Self-healing invariant: an egg-stage pet (level < 3) should never have a
// hatch date, but any save written before this fix shipped may still be
// carrying one (petBirthdate used to mean "when this save was created," not
// "when the pet hatched" -- see defaultData() above). Clearing it here means
// the "Hatched ..." line never shows for a pet that's visibly still an egg;
// awardXp() below sets a fresh, correct value the moment it actually hatches.
// Cheap enough to just run on every load rather than gating it behind a flag.
function enforceHatchDateInvariant() {
  const { level } = xpProgress();
  if (level < 3 && data.petBirthdate) {
    data.petBirthdate = null;
    saveData();
  }
}

// One-time-in-spirit backfill for anyone who pledged, marked a day clean, or
// journaled before these action-unlocked cosmetics existed: history (the
// pledgedDays/confirmedDays/journalXpDates arrays) already proves the action
// happened, so the matching item unlocks retroactively -- quietly, with no
// announcement popup, since that's reserved for a live in-the-moment action
// (see queueUnlockAnnouncements() below). Just OR-ing booleans forward, so
// it's safe and cheap to run on every load rather than gating behind a flag.
function applyEventUnlockBackfill() {
  const before = JSON.stringify(data.eventUnlocks);
  if (data.pledgedDays.length > 0) data.eventUnlocks.firstPledge = true;
  if (data.confirmedDays.length > 0) data.eventUnlocks.firstMarkClean = true;
  if (data.journalXpDates.length > 0) data.eventUnlocks.firstJournal = true;
  if (JSON.stringify(data.eventUnlocks) !== before) saveData();
}

function saveData() {
  data.relapses = Array.from(new Set(data.relapses)).sort();
  data.confirmedDays = Array.from(new Set(data.confirmedDays)).sort();
  data.pledgedDays = Array.from(new Set(data.pledgedDays)).sort();
  data.journalXpDates = Array.from(new Set(data.journalXpDates)).sort();
  data.autoXpDates = Array.from(new Set(data.autoXpDates)).sort();
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
  // Same "today isn't banked until it's over" rule as currentStreakDays() /
  // longestStreakDays() -- changed 2026-08-30, per Eric noticing this could
  // read one day ahead of the streak counters (e.g. "2 days clean" up top
  // but "3" total) even with zero slips logged, which read as a bug. All
  // three numbers now agree on what counts as a completed day.
  const span = daysBetween(data.settings.quitDate, today);
  const relapsesInRange = data.relapses.filter(
    (r) => r >= data.settings.quitDate && r < today
  ).length;
  return Math.max(0, span - relapsesInRange);
}

function moneySaved() {
  const dailyCost = Number(data.settings.dailyCost) || 0;
  return Math.round(totalClearDays() * dailyCost);
}

/* ---------- XP, leveling, and the pet companion ----------
   Tunable knobs -- easy to rebalance later without touching the logic below. */

const XP_PLEDGE = 35; // tapping the one-time morning/afternoon pledge, before 8pm
const XP_CLEAN_DAY = 50; // tapping "Mark today clean" after 8pm -- exactly enough to hit level 2 solo, day one
const XP_CLEAN_DAY_AUTO = XP_CLEAN_DAY / 2; // half credit, quietly backfilled for a clean day Shawn never actively confirmed -- see processPastCleanDays()
const XP_JOURNAL_ENTRY = 15; // writing a journal note, once per calendar day

// Shown after tapping the pledge button -- the day hasn't happened yet at
// that point, so (unlike the after-8pm fanfare) this isn't the moment to ask
// "how did today go." A short line of encouragement instead, picked at
// random each time. author is null for a few generic/unattributed ones.
const PLEDGE_ENCOURAGEMENTS = [
  { text: "One day at a time.", author: null },
  { text: "Progress, not perfection.", author: null },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { text: "The best way out is always through.", author: "Robert Frost" },
  { text: "Believe you can, and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Small steps, every day, add up to big change.", author: null },
  { text: "You don't have to be great to start. You have to start to be great.", author: "Zig Ziglar" },
  { text: "Every day you choose this, you win.", author: null },
];

// Cumulative XP required to REACH a given level (level 1 starts at 0 XP).
// Not a plain quadratic -- level 2 is pinned to exactly XP_CLEAN_DAY (50) so
// one clean-day tap on day one is enough to level up immediately, while the
// curve accelerates faster than a pure quadratic further out so level 15
// lands around 6 months out for someone doing both daily rituals (pledge +
// mark clean, ~85 XP/day): 2*(level-1)^2*(level+23) -- e.g. level 5 at 896,
// level 10 at 5,346, level 15 at 14,896.
function xpForLevel(level) {
  const n = level - 1;
  return 2 * n * n * (level + 23);
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
  // The moment the pet actually crosses into level 3, record today as its
  // real hatch date -- see the petBirthdate comment in defaultData() and
  // enforceHatchDateInvariant() above. Every XP-earning path (pledge, mark
  // clean, journal entry, and the silent past-day auto-credit) funnels
  // through here, so this is the one place that needs to know about it.
  if (after >= 3 && !data.petBirthdate) {
    data.petBirthdate = todayStr();
  }
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
// unlocked and is how Shawn un-equips a slot. Every item carries an `unlock`
// descriptor instead of a bare level number, since two shapes exist:
//   { type: "level", minLevel: N } -- unlocked once xpProgress().level >= N
//   { type: "event", event: "firstPledge"|"firstJournal"|"firstMarkClean",
//     label: "..." } -- unlocked the moment data.eventUnlocks[event] is true,
//     independent of level. label is the locked-tile hint text (see
//     renderPetUnlockGrid()) -- there's no level number to show instead.
// atLevel() is just a shorthand for building the common case below.
function atLevel(n) {
  return { type: "level", minLevel: n };
}

// Nothing unlocks until the egg hatches at level 3 -- from there, one new
// accessory unlocks every single level through 15, so there's always
// something new right around the corner. "Hi, My Name Is..." (added
// 2026-08-30, per Eric) breaks that level pattern on purpose: it unlocks the
// first time Shawn marks a day clean, whatever level he's at when that
// happens, like the badge someone might wear to a meeting.
const ACCESSORIES = [
  { key: "none", name: "None", unlock: atLevel(1) },
  { key: "pacifier", name: "Pacifier", unlock: atLevel(3) },
  { key: "shades", name: "Shades", unlock: atLevel(4) },
  { key: "clownnose", name: "Clown Nose", unlock: atLevel(5) },
  { key: "bowtie", name: "Bow Tie", unlock: atLevel(6) },
  { key: "eyepatch", name: "Eye Patch", unlock: atLevel(7) },
  { key: "skimask", name: "Ski Mask", unlock: atLevel(8) },
  { key: "crown", name: "Flower Crown", unlock: atLevel(9) },
  { key: "goggles", name: "Goggles", unlock: atLevel(10) },
  { key: "roundglasses", name: "Round Glasses", unlock: atLevel(11) },
  { key: "catglasses", name: "Cat-Eye Glasses", unlock: atLevel(12) },
  { key: "monocle", name: "Monocle", unlock: atLevel(13) },
  { key: "mustache", name: "Mustache", unlock: atLevel(14) },
  { key: "tophat", name: "Top Hat", unlock: atLevel(15) },
  {
    key: "namebadge",
    name: "Hi, My Name Is...",
    unlock: { type: "event", event: "firstMarkClean", label: "Unlocks the first time you mark a day clean" },
  },
];

// Sakura Garden and Green Knoll (both added 2026-08-30, per Eric) are the
// same idea as the badge above, applied to backgrounds: unlocked by doing
// the thing, not by leveling.
const BACKGROUNDS = [
  { key: "none", name: "None", unlock: atLevel(1) },
  { key: "sunrise", name: "Sunrise", unlock: atLevel(1) },
  { key: "cleanbeach", name: "Sunrise, Cleaned Up", unlock: atLevel(4) },
  { key: "meadow", name: "Meadow", unlock: atLevel(5) },
  { key: "stars", name: "Starry Night", unlock: atLevel(7) },
  { key: "aurora", name: "Aurora", unlock: atLevel(10) },
  {
    key: "sakuragarden",
    name: "Sakura Garden",
    unlock: { type: "event", event: "firstJournal", label: "Unlocks on your first journal entry" },
  },
  {
    key: "greenknoll",
    name: "Green Knoll",
    unlock: { type: "event", event: "firstPledge", label: "Unlocks on your first pledge" },
  },
];

function isUnlocked(item, level) {
  if (item.unlock.type === "event") return !!data.eventUnlocks[item.unlock.event];
  return level >= item.unlock.minLevel;
}

// Which ACCESSORIES/BACKGROUNDS items just became newly unlocked by a level
// change from beforeLevel to afterLevel -- event-unlocked items are handled
// separately at their own trigger point (see handlePledge() etc.), since
// they have nothing to do with level.
function collectNewlyUnlockedLevelItems(beforeLevel, afterLevel) {
  const found = [];
  ACCESSORIES.forEach((item) => {
    if (item.unlock.type === "level" && item.unlock.minLevel > beforeLevel && item.unlock.minLevel <= afterLevel) {
      found.push({ key: item.key, name: item.name, kind: "accessory" });
    }
  });
  BACKGROUNDS.forEach((item) => {
    if (item.unlock.type === "level" && item.unlock.minLevel > beforeLevel && item.unlock.minLevel <= afterLevel) {
      found.push({ key: item.key, name: item.name, kind: "background" });
    }
  });
  return found;
}

function isEveningUnlocked() {
  return new Date().getHours() >= 20; // Shawn's phone's local time, no timezone math needed
}

function todayConfirmed() {
  return data.confirmedDays.includes(todayStr());
}

function todayPledged() {
  return data.pledgedDays.includes(todayStr());
}

function todayIsSlip() {
  return data.relapses.includes(todayStr());
}

// One-time migration for anyone whose save data predates this XP system
// (pledge + mark-clean rebalance + auto half-credit) -- loadData() gives
// existing saves xpResetApplied: false since the field didn't exist before,
// so the very first load after this ships would otherwise walk all the way
// back to quitDate and backfill a pile of retroactive auto-XP for days that
// happened before the reward system did. Instead: XP starts over at 0, and
// every past day (quitDate through yesterday) gets marked as already
// resolved in autoXpDates -- with no payout -- so processPastCleanDays()
// below has nothing left to backfill. Leaves confirmedDays, pledgedDays, the
// streak, and everything else untouched; this only resets the XP counter and
// pre-empts its own catch-up mechanic. Runs once, guarded by the flag.
function applyLaunchXpReset() {
  if (data.xpResetApplied) return;
  data.xp = 0;
  if (data.settings.quitDate) {
    const yesterday = addDays(todayStr(), -1);
    let cursor = data.settings.quitDate;
    while (cursor <= yesterday) {
      if (!data.autoXpDates.includes(cursor)) data.autoXpDates.push(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  data.xpResetApplied = true;
  saveData();
}

// Quietly backfills half-XP (XP_CLEAN_DAY_AUTO) for any past, fully-over day
// that was clean but never got an active "Mark today clean" tap -- the
// streak itself never needed that tap (always automatic/forgiving), and now
// XP doesn't either. Only looks at days strictly before today, so it can
// never pay out for a day that's still in progress; today's own payout, if
// any, only ever happens through handleMarkCleanDay(). Idempotent (checks
// autoXpDates/confirmedDays first) and cheap, so it's safe to just run on
// every load rather than trying to track a "last processed" cursor.
function processPastCleanDays() {
  if (!data.settings.quitDate) return;
  const yesterday = addDays(todayStr(), -1);
  if (yesterday < data.settings.quitDate) return;
  let cursor = data.settings.quitDate;
  let changed = false;
  while (cursor <= yesterday) {
    const isSlip = data.relapses.includes(cursor);
    const alreadyPaid = data.confirmedDays.includes(cursor) || data.autoXpDates.includes(cursor);
    if (!isSlip && !alreadyPaid) {
      awardXp(XP_CLEAN_DAY_AUTO);
      data.autoXpDates.push(cursor);
      changed = true;
    }
    cursor = addDays(cursor, 1);
  }
  if (changed) saveData();
}

/* ---------- rendering ---------- */

let calYear, calMonth; // 0-indexed month, currently displayed

// Queue of {key, name, kind: "accessory"|"background"} items waiting to
// show the "New unlock!" modal, one at a time, so an action that unlocks
// more than one thing at once never stacks modals. openJournalAfterUnlocks
// defers the "Add a journal entry" flow (from the fanfare modal) until the
// queue drains, so that modal and this one never overlap either.
let pendingUnlockAnnouncements = [];
let openJournalAfterUnlocks = false;

function init() {
  const t = strToDate(todayStr());
  calYear = t.getFullYear();
  calMonth = t.getMonth();

  applyLaunchXpReset();
  processPastCleanDays();
  enforceHatchDateInvariant();
  applyEventUnlockBackfill();
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
  // Eyes and mouth use the fixed --pet-ink/--pet-light tokens (not
  // --ink/--card-bg) so the face reads the same in light and dark mode --
  // fixed 2026-08-30 after the mouth was going near-white in dark mode.
  const eyes = `<circle cx="49" cy="64" r="4.5" fill="var(--pet-light)"/><circle cx="71" cy="64" r="4.5" fill="var(--pet-light)"/><circle cx="49" cy="64" r="2.2" fill="var(--pet-ink)"/><circle cx="71" cy="64" r="2.2" fill="var(--pet-ink)"/>`;
  const smile = `<path d="M52 76 Q60 82 68 76" stroke="var(--pet-ink)" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
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
    // Shell fill baked to its light-mode hex (#fbecd3), same reasoning as the
    // face/accessories/backgrounds above -- fixed 2026-08-31 after Eric asked
    // for the egg to also stay put with a light-mode look regardless of
    // theme, rather than the shell going dark like the eventual pet's own
    // dark-mode variables used to. var(--amber-500) stays a var since it was
    // already fixed across both themes.
    return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Egg">
      ${bg}
      <ellipse cx="60" cy="68" rx="30" ry="38" fill="#fbecd3" stroke="var(--amber-500)" stroke-width="2.5"/>
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
  // guardian -- fully evolved, small wings and a sparkle aura. Halo wash
  // baked to its light-mode hex, same as the egg shell above -- this is part
  // of the pet's own art, not the equipped background, so it gets the same
  // fixed-color treatment.
  return `<svg viewBox="0 0 120 120" class="pet-svg" aria-label="Guardian">
    ${bg}
    <circle cx="60" cy="68" r="46" fill="#e3f4f1" opacity="0.6"/>
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
//
// Colors here are deliberately hardcoded hex, not --teal-100/--amber-100/
// --card-bg/--border theme vars -- fixed 2026-08-30 after Eric pointed out
// backgrounds were recoloring with dark mode (a sunrise sky shouldn't turn
// into a night sky just because Shawn's phone is in dark mode). Baking these
// in also leaves room for a future background that's deliberately a day or
// night scene on purpose -- that'd be a real design choice per item, not an
// accident of the site theme. var(--amber-500)/var(--teal-500)/
// var(--teal-700)/var(--teal-900) are left as-is on purpose: those three
// were already fixed across both themes (never redefined in styles.css), so
// there's nothing to bake there.
function backgroundSvg(key) {
  // Sunrise / Sunrise, Cleaned Up -- a two-stage pair added 2026-08-31 (per
  // Eric: "since this is intended to be the default option... we're going
  // to make the beach get nicer looking over time"). "sunrise" (level 1,
  // the default) is a beach that hasn't been cleaned up yet; "cleanbeach"
  // (level 4) is the same scene tidied -- see the full explanation above
  // backgroundSvgTall()'s own cases below. This square version of each is
  // the same scene simplified/rescaled for the small sizes it's actually
  // shown at, not a different design.
  if (key === "sunrise") {
    return `<rect x="0" y="0" width="120" height="120" fill="#fdf6e3"/>
      <path d="M0 30 Q60 20 120 30 L120 120 L0 120 Z" fill="#ffe9c7" opacity="0.6"/>
      <path d="M0 50 Q60 41 120 50 L120 120 L0 120 Z" fill="#ffd9ae" opacity="0.55"/>
      <path d="M0 68 Q60 59 120 68 L120 120 L0 120 Z" fill="#ffc9a8" opacity="0.55"/>
      <circle cx="60" cy="64" r="22" fill="#ffb347" opacity="0.16"/>
      <circle cx="60" cy="64" r="15" fill="#ffb347" opacity="0.32"/>
      <circle cx="60" cy="64" r="9.5" fill="#ffa72b"/>
      <path d="M0 64 L120 64 L120 81 L0 81 Z" fill="#bfe0df"/>
      <path d="M0 72.5 L120 72.5 L120 81 L0 81 Z" fill="#a7d2d0" opacity="0.7"/>
      <g transform="translate(9,67.5)" opacity="0.55" fill="#5c4433">
        <path d="M-3 2 Q0 4 3 2 L2.5 1 L-2.5 1 Z"/>
        <rect x="-0.25" y="-4.5" width="0.5" height="5.5"/>
        <path d="M0 -4.5 L3.5 0.5 L0 0.5 Z"/>
      </g>
      <path d="M8 69 Q20 67 32 69 T56 69" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.5"/>
      <path d="M64 74 Q76 72 88 74 T112 74" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.45"/>
      <path d="M0 81 Q5 78.5 10 81 Q15 83.5 20 81 Q25 78.5 30 81 Q35 83.5 40 81 Q45 78.5 50 81 Q55 83.5 60 81 Q65 78.5 70 81 Q75 83.5 80 81 Q85 78.5 90 81 Q95 83.5 100 81 Q105 78.5 110 81 Q115 83.5 120 81 L120 120 L0 120 Z" fill="#ddd0a8"/>
      <g transform="translate(48,104) scale(0.5)">
        <path d="M-9 15 L-11 -13 Q0 -17 11 -13 L9 15 Q0 19 -9 15 Z" fill="#3a6b62"/>
        <ellipse cx="0" cy="-13" rx="11" ry="3" fill="#2c5450"/>
      </g>
      <g transform="translate(48,95) scale(0.5)" fill="#f2efe6" opacity="0.92">
        <path d="M-11 4 Q-15 -6 -6 -10 Q4 -14 8 -6 Q12 1 6 5 Q-2 9 -6 8 Q-10 9 -11 4 Z"/>
      </g>
      <g transform="translate(38,109) scale(0.5)" fill="#33322f" opacity="0.88">
        <path d="M-10 6 Q-13 -4 -4 -8 Q5 -11 10 -3 Q13 4 7 8 Q-2 12 -10 6 Z"/>
      </g>
      <g transform="translate(9,98) scale(0.5)" opacity="0.9">
        <rect x="-3" y="-11" width="6" height="20" rx="3" fill="#aaa89a" transform="rotate(15)"/>
      </g>
      <g transform="translate(35,115.5) scale(0.5)" stroke="#d8d08a" stroke-width="1.3" fill="none" opacity="0.85">
        <circle cx="0" cy="0" r="4"/><circle cx="7" cy="0" r="4"/>
      </g>
      <g transform="translate(6,111) scale(0.5)">
        <path d="M-6 -4 L5 -6 L8 3 L-2 7 L-8 1 Z" fill="#cfcfc7"/>
      </g>
      <g transform="translate(14,116.5) scale(0.5)">
        <path d="M-7 0 Q-3 -7 4 -5 Q8 -2 6 3 Q0 7 -7 0 Z" fill="#c9a13a"/>
      </g>
      <g opacity="0.85" fill="#2a2620"><circle cx="17" cy="114" r="0.5"/><circle cx="19" cy="116" r="0.4"/></g>
      <g transform="translate(3,103) scale(0.5) rotate(100)" opacity="0.88">
        <rect x="-3" y="-11" width="6" height="20" rx="3" fill="#a3a698"/>
      </g>
      <g transform="translate(9.5,115.5) scale(0.5) rotate(60)" opacity="0.9">
        <rect x="-3" y="-11" width="6" height="20" rx="3" fill="#b0aca0"/>
      </g>
      <g transform="translate(52,110) scale(0.5) rotate(-10)" opacity="0.85">
        <path d="M-8 0 L-13 -3.5 L-13 3.5 Z" fill="#9fb0ac"/>
        <path d="M-8 0 Q-8 -3 -2 -3 Q4 -3 8 0 Q4 3 -2 3 Q-8 3 -8 0 Z" fill="#9fb0ac"/>
        <circle cx="-4" cy="-0.5" r="0.7" fill="#5c6b68"/>
      </g>`;
  }
  if (key === "cleanbeach") {
    return `<rect x="0" y="0" width="120" height="120" fill="#fdf6e3"/>
      <path d="M0 30 Q60 20 120 30 L120 120 L0 120 Z" fill="#ffe9c7" opacity="0.6"/>
      <path d="M0 50 Q60 41 120 50 L120 120 L0 120 Z" fill="#ffd9ae" opacity="0.55"/>
      <path d="M0 68 Q60 59 120 68 L120 120 L0 120 Z" fill="#ffc9a8" opacity="0.55"/>
      <circle cx="60" cy="64" r="22" fill="#ffb347" opacity="0.16"/>
      <circle cx="60" cy="64" r="15" fill="#ffb347" opacity="0.32"/>
      <circle cx="60" cy="64" r="9.5" fill="#ffa72b"/>
      <path d="M0 64 L120 64 L120 81 L0 81 Z" fill="#bfe0df"/>
      <path d="M0 72.5 L120 72.5 L120 81 L0 81 Z" fill="#a7d2d0" opacity="0.7"/>
      <g transform="translate(9,67.5)" opacity="0.55" fill="#5c4433">
        <path d="M-3 2 Q0 4 3 2 L2.5 1 L-2.5 1 Z"/>
        <rect x="-0.25" y="-4.5" width="0.5" height="5.5"/>
        <path d="M0 -4.5 L3.5 0.5 L0 0.5 Z"/>
      </g>
      <path d="M8 69 Q20 67 32 69 T56 69" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.5"/>
      <path d="M64 74 Q76 72 88 74 T112 74" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.45"/>
      <path d="M0 81 Q5 78.5 10 81 Q15 83.5 20 81 Q25 78.5 30 81 Q35 83.5 40 81 Q45 78.5 50 81 Q55 83.5 60 81 Q65 78.5 70 81 Q75 83.5 80 81 Q85 78.5 90 81 Q95 83.5 100 81 Q105 78.5 110 81 Q115 83.5 120 81 L120 120 L0 120 Z" fill="#f2e2c4"/>
      <path d="M0 81 Q5 78.5 10 81 Q15 83.5 20 81 Q25 78.5 30 81 Q35 83.5 40 81 Q45 78.5 50 81 Q55 83.5 60 81 Q65 78.5 70 81 Q75 83.5 80 81 Q85 78.5 90 81 Q95 83.5 100 81 Q105 78.5 110 81 Q115 83.5 120 81" fill="none" stroke="#ffffff" stroke-width="0.9" opacity="0.55"/>
      <g opacity="0.5" fill="#c9a876"><circle cx="20" cy="98" r="1"/><circle cx="88" cy="102" r="1.1"/><circle cx="50" cy="110" r="0.9"/></g>`;
  }
  if (key === "meadow") {
    return `<path d="M0 96 Q30 84 60 96 T120 96 L120 120 L0 120 Z" fill="#e3f4f1"/><circle cx="20" cy="100" r="3" fill="var(--amber-500)"/><circle cx="100" cy="102" r="3" fill="var(--amber-500)"/><circle cx="36" cy="107" r="2.2" fill="var(--teal-700)"/><circle cx="88" cy="108" r="2.2" fill="var(--teal-700)"/>`;
  }
  if (key === "stars") {
    return `<rect x="0" y="0" width="120" height="120" fill="var(--teal-900)" opacity="0.16"/><circle cx="18" cy="22" r="1.7" fill="var(--amber-500)"/><circle cx="100" cy="18" r="1.4" fill="var(--amber-500)"/><circle cx="30" cy="102" r="1.4" fill="var(--amber-500)"/><circle cx="106" cy="96" r="1.7" fill="var(--amber-500)"/><circle cx="12" cy="70" r="1.3" fill="var(--amber-500)"/>`;
  }
  if (key === "aurora") {
    return `<circle cx="60" cy="60" r="54" fill="#e3f4f1" opacity="0.5"/><path d="M6 48 Q60 18 114 48" stroke="var(--amber-500)" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/><path d="M6 60 Q60 32 114 60" stroke="var(--teal-700)" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>`;
  }
  // Cozy neo-Tokyo zen garden, jazzed up 2026-08-31 (per Eric) -- see the
  // full redesign notes above backgroundSvgTall()'s own sakuragarden case
  // below; this square version is the same scene simplified/rescaled for
  // the small sizes it's actually shown at, not a different design. Sakura
  // pink and every other new color here is hardcoded (not a theme var) on
  // purpose, same reasoning as clownnose's red -- this scene shouldn't
  // shift color with dark mode.
  if (key === "sakuragarden") {
    return `<rect x="0" y="0" width="120" height="120" fill="#f4eef6"/>
      <path d="M0 25 Q60 16 120 25 L120 92 L0 92 Z" fill="#fbdfe6" opacity="0.5"/>
      <path d="M0 46 Q60 38 120 46 L120 92 L0 92 Z" fill="#ffdcb0" opacity="0.35"/>
      <circle cx="55" cy="25" r="14" fill="#ffe3c2" opacity="0.5"/>
      <circle cx="55" cy="25" r="8" fill="#ffd39a" opacity="0.85"/>
      <path d="M-6 20 Q6 15 16 20 Q26 15 34 20 Q24 23 15 22 Q6 23 -6 20 Z" fill="#ffffff" opacity="0.5"/>
      <g opacity="0.85">
        <rect x="12" y="30" width="3" height="34" fill="#a0453c"/>
        <rect x="27" y="30" width="3" height="34" fill="#a0453c"/>
        <rect x="9" y="30" width="24" height="4" fill="#a0453c"/>
        <rect x="7" y="22" width="28" height="4.5" rx="1" fill="#a0453c"/>
      </g>
      <path d="M91 68 Q89 52 92 38 Q93 32 91 27 Q97 31 95 38 Q92 54 95 68 Z" fill="#6b4a3a"/>
      <path d="M92 38 Q97 32 102 28" stroke="#6b4a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M91 35 Q86 30 82 25" stroke="#6b4a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="104" cy="28" r="8" fill="#f3c9d6"/>
      <circle cx="111" cy="32" r="6" fill="#e88fae"/>
      <circle cx="108" cy="37" r="5.5" fill="#e88fae"/>
      <circle cx="94" cy="20" r="7" fill="#f3c9d6"/>
      <circle cx="83" cy="26" r="6" fill="#eda3bd"/>
      <circle cx="88" cy="32" r="7" fill="#eda3bd"/>
      <g fill="#e0688f" opacity="0.7">
        <circle cx="115" cy="27" r="1.3"/>
        <circle cx="78" cy="30" r="1.3"/>
        <circle cx="98" cy="14" r="1.2"/>
      </g>
      <path d="M0 92 L120 92 L120 120 L0 120 Z" fill="#f2ead9"/>
      <path d="M8 98 Q60 92 112 98" stroke="#e6dcc2" stroke-width="1.4" fill="none" opacity="0.75"/>
      <path d="M55 106 Q80 96 105 106" stroke="#d8c9a8" stroke-width="1.3" fill="none" opacity="0.75"/>
      <path d="M50 114 Q80 102 110 114" stroke="#d8c9a8" stroke-width="1.2" fill="none" opacity="0.7"/>
      <g opacity="0.9">
        <rect x="8" y="104" width="8" height="6" rx="1" fill="#847e6f"/>
        <rect x="10" y="93" width="4" height="13" fill="#948e7e"/>
        <path d="M6 93 L12 84 L18 93 Z" fill="#847e6f"/>
      </g>
      <g opacity="0.9">
        <ellipse cx="82" cy="107" rx="9" ry="6" fill="#a8a297"/>
        <ellipse cx="91" cy="103" rx="6" ry="4.5" fill="#b7b2a5"/>
      </g>
      <circle cx="79" cy="109" r="1.8" fill="var(--teal-700)" opacity="0.5"/>
      <g fill="#f3c9d6" opacity="0.9">
        <circle cx="40" cy="20" r="2"/>
        <circle cx="60" cy="14" r="1.6"/>
        <circle cx="72" cy="64" r="2"/>
        <circle cx="20" cy="52" r="1.6"/>
        <circle cx="30" cy="98" r="1.5"/>
      </g>`;
  }
  // Sunny knoll, redrawn 2026-08-31 (per Eric, "a fresh go at the green
  // knoll background idea") -- see the full redesign notes above
  // backgroundSvgTall()'s own greenknoll case below; this square version is
  // the same scene simplified/rescaled for the small sizes it's actually
  // shown at (84px pet-card icon, 52px unlock-grid tile), not a different
  // design.
  if (key === "greenknoll") {
    return `<rect x="0" y="0" width="120" height="120" fill="#f3f7e6"/>
      <circle cx="94" cy="20" r="13" fill="var(--amber-500)" opacity="0.18"/>
      <circle cx="94" cy="20" r="8" fill="var(--amber-500)" opacity="0.6"/>
      <g opacity="0.85" fill="#ffffff"><ellipse cx="26" cy="24" rx="9" ry="5.5"/><ellipse cx="34" cy="22" rx="6.5" ry="4.5"/></g>
      <path d="M0 60 Q30 46 60 58 T120 55 L120 120 L0 120 Z" fill="#e4f3da"/>
      <path d="M0 78 Q30 64 60 76 T120 73 L120 120 L0 120 Z" fill="#c3e6b0"/>
      <path d="M0 96 Q30 84 60 94 T120 91 L120 120 L0 120 Z" fill="#78bd68"/>
      <path d="M70 64 Q86 69 72 78 Q62 85 70 94 Q78 102 66 111 Q60 116 64 120" fill="none" stroke="#e9dcb0" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
      <path d="M70 64 Q86 69 72 78 Q62 85 70 94 Q78 102 66 111 Q60 116 64 120" fill="none" stroke="#cdbb86" stroke-width="0.9" stroke-linecap="round" opacity="0.5"/>
      <rect x="17" y="68" width="4" height="24" rx="1.5" fill="#6b4a3a"/>
      <circle cx="19" cy="60" r="12" fill="var(--teal-700)" opacity="0.55"/>
      <circle cx="12" cy="66" r="9" fill="var(--teal-700)" opacity="0.6"/>
      <circle cx="24" cy="65" r="8" fill="var(--teal-500)" opacity="0.65"/>
      <g opacity="0.9"><circle cx="50" cy="92" r="1.8" fill="var(--amber-500)"/><circle cx="96" cy="98" r="1.8" fill="var(--amber-500)"/></g>`;
  }
  return ""; // none
}

// Same six backgrounds as backgroundSvg() above, redrawn for a taller
// 120x240 canvas instead of the square 120x120 -- used only for the
// full-screen pet stage backdrop (added 2026-08-31, per Eric: "design the
// backgrounds better to properly fill a vertically oriented phone screen").
// The square art forced to cover a real phone's aspect ratio needed a ~6x
// crop (too zoomed in, per Eric's first pass of feedback); bounding that
// crop to stay mild instead left a visible gap at the bottom (per his
// second pass) since the square art simply didn't reach that far. Redrawing
// each background against a canvas close to an actual phone's own aspect
// ratio (120x240 is close to a typical ~9:19.5 phone screen) is the real
// fix -- it needs only a mild crop to cover edge-to-edge, so this is a
// separate function/canvas rather than a CSS-only tweak. Every case starts
// with a full-canvas base wash specifically so there's never a transparent
// gap, whatever the composition on top of it; "none" is left to fall
// through to the pet stage's own flat `--bg`, same as the square version.
function backgroundSvgTall(key) {
  // Sunrise / Sunrise, Cleaned Up -- reworked into a two-stage pair
  // 2026-08-31 (per Eric, right after seeing the single spiced-up "sunrise
  // over a beach" redesign below: "since this is intended to be the
  // default option... we're going to make the beach get nicer looking over
  // time"). The original spiced-up single-stage version (layered warm sky,
  // a sun cresting a narrow strip of distant water, a sandy foreground
  // shore, a sailboat, driftwood/shells) is now "cleanbeach" -- a level-4
  // unlock, saved exactly as it stood right before this change (per Eric:
  // "save a clean version of this as it is now, minus the pelican"). A
  // pelican was tried standing on the sand in "sunrise" for a round (per
  // Eric: "let's put the Pelican on the beach"), then dropped entirely
  // 2026-08-31 per Eric ("ditch the pelican, it looks weird") once the
  // litter itself got a detail pass -- an overflowing trash barrel with
  // bulging bags inspired by a reference photo Eric sent. "sunrise" keeps
  // the level-1 default slot but is now the *un*cleaned version of the
  // same beach: same sky, sun, water, and boat (still the same place, same
  // time of day -- only the shore has changed), but the shore itself is
  // covered in litter instead of driftwood and shells -- an overflowing
  // barrel with bulging trash bags and a stray black bag, a scattering of
  // empty cans on the left side, a six-pack ring holder, a scrap of
  // tinfoil, a plastic bottle, a couple of paper scraps, an old banana
  // peel with a couple of flies over it, a small dead fish, and a couple
  // of gulls. The idea: Shawn's own beach visibly tidies up as he levels,
  // the same "getting better over time" arc as everything else in this
  // app, just told through the *background* instead of the pet directly
  // for once. All litter items are ordinary, non-drug-related beach trash
  // on purpose -- this is a fun progression gag, not a pointed metaphor,
  // so it stays generic (cans/wrappers/plastic), never anything that reads
  // as referencing kratom or paraphernalia specifically.
  //
  // Both share the same underlying scene, described once here rather than
  // twice: layered warm sky (butter yellow up top fading through peach
  // into coral near the horizon -- same flat-shapes-stacked-with-opacity
  // technique used everywhere else in this app, no real SVG gradients)
  // with two soft clouds, a couple of distant birds, and a small sailboat
  // silhouette on the water; a glowing three-ring sun sitting right on a
  // narrow strip of distant water, drawn *before* that water so its own
  // shape (z-order, same occlusion trick as Sakura Garden's
  // mountain-behind-sun and Green Knoll's path-behind-Buddy) naturally
  // covers the sun's lower half -- reads as the sun cresting the horizon
  // rather than floating above it. A sandy foreground shore sits between
  // the water and Buddy (added after an early draft had the water itself
  // reach all the way down to where the pet stands -- reads as though
  // Buddy is standing on open water, the same kind of "floating" problem
  // the very first grounding round above fixed for the pet's own vertical
  // position, just for this one background's content instead of CSS). The
  // water strip is kept narrow and placed right around y128-162 -- the
  // same y158-168ish band every other background's own ground plane sits
  // in, since `.pet-stage-art`'s `bottom: 27%` anchor is shared across all
  // backgrounds and isn't tuned per background (see the
  // creature-grounded-on-horizon round above) -- so the *sand*, not the
  // water, is what actually needs to sit there for Buddy's feet to land on
  // solid ground. All colors fixed hex on purpose, same reasoning as every
  // other background here -- this scene shouldn't shift with dark mode.
  if (key === "sunrise") {
    return `<rect x="0" y="0" width="120" height="240" fill="#fdf6e3"/>
      <path d="M0 60 Q60 40 120 60 L120 240 L0 240 Z" fill="#ffe9c7" opacity="0.6"/>
      <path d="M0 100 Q60 82 120 100 L120 240 L0 240 Z" fill="#ffd9ae" opacity="0.55"/>
      <path d="M0 135 Q60 118 120 135 L120 240 L0 240 Z" fill="#ffc9a8" opacity="0.55"/>
      <path d="M-10 34 Q10 25 28 34 Q46 25 62 34 Q46 40 28 38 Q10 40 -10 34 Z" fill="#ffffff" opacity="0.5"/>
      <path d="M64 16 Q82 9 100 16 Q90 21 78 19 Q70 21 64 16 Z" fill="#ffffff" opacity="0.4"/>
      <g stroke="var(--teal-900)" stroke-width="1.4" fill="none" opacity="0.4" stroke-linecap="round">
        <path d="M30 50 q4 -5 8 0 q4 -5 8 0"/>
        <path d="M80 70 q3 -4 6 0 q3 -4 6 0"/>
      </g>
      <circle cx="60" cy="128" r="44" fill="#ffb347" opacity="0.16"/>
      <circle cx="60" cy="128" r="30" fill="#ffb347" opacity="0.32"/>
      <circle cx="60" cy="128" r="19" fill="#ffa72b"/>
      <path d="M0 128 L120 128 L120 162 L0 162 Z" fill="#bfe0df"/>
      <path d="M0 145 L120 145 L120 162 L0 162 Z" fill="#a7d2d0" opacity="0.7"/>
      <g transform="translate(18,135)" opacity="0.55" fill="#5c4433">
        <path d="M-6 4 Q0 8 6 4 L5 2 L-5 2 Z"/>
        <rect x="-0.5" y="-9" width="1" height="11"/>
        <path d="M0 -9 L7 1 L0 1 Z"/>
      </g>
      <path d="M14 138 Q34 134 54 138 T94 138" stroke="#ffffff" stroke-width="1.1" fill="none" opacity="0.5"/>
      <path d="M10 150 Q32 146 56 150 T104 150" stroke="#ffffff" stroke-width="1.1" fill="none" opacity="0.45"/>
      <path d="M0 162 Q10 157 20 162 Q30 167 40 162 Q50 157 60 162 Q70 167 80 162 Q90 157 100 162 Q110 167 120 162 L120 240 L0 240 Z" fill="#ddd0a8"/>
      <g transform="translate(96,208)">
        <path d="M-9 15 L-11 -13 Q0 -17 11 -13 L9 15 Q0 19 -9 15 Z" fill="#3a6b62"/>
        <ellipse cx="0" cy="-13" rx="11" ry="3" fill="#2c5450"/>
        <path d="M-7 -5 L-5.5 11 M0 -7 L0 13 M7 -5 L5.5 11" stroke="#2c5450" stroke-width="0.7" opacity="0.5"/>
      </g>
      <g fill="#f2efe6" opacity="0.92">
        <path d="M85 199 Q81 189 90 185 Q99 181 104 189 Q108 196 101 201 Q94 205 88 203 Q84 204 85 199 Z"/>
        <path d="M91 187 Q93 184 96 186" stroke="#cfc9b8" stroke-width="0.8" fill="none"/>
      </g>
      <g fill="#eae6d8" opacity="0.9">
        <path d="M100 192 Q97 184 105 182 Q112 180 114 187 Q116 193 110 195 Q104 197 100 192 Z"/>
      </g>
      <g fill="#e3ded0" opacity="0.85">
        <path d="M92 178 Q90 172 96 170 Q102 169 103 174 Q104 179 98 180 Q93 181 92 178 Z"/>
        <path d="M96 171 L98 167" stroke="#c9c2ae" stroke-width="1" stroke-linecap="round"/>
      </g>
      <g transform="translate(76,222)" fill="#33322f" opacity="0.88">
        <path d="M-10 6 Q-13 -4 -4 -8 Q5 -11 10 -3 Q13 4 7 8 Q-2 12 -10 6 Z"/>
        <path d="M-1 -8 L2 -12" stroke="#1f1e1c" stroke-width="1" stroke-linecap="round"/>
      </g>
      <g transform="translate(18,196) rotate(15)" opacity="0.9">
        <rect x="-3" y="-11" width="6" height="20" rx="3" fill="#aaa89a"/>
        <ellipse cx="0" cy="-11" rx="3" ry="1.1" fill="#8c8a7c"/>
        <path d="M-3 3 L3 3" stroke="#8c8a7c" stroke-width="0.8"/>
      </g>
      <g transform="translate(70,231)" stroke="#d8d08a" stroke-width="1.1" fill="none" opacity="0.85">
        <circle cx="0" cy="0" r="3.8"/><circle cx="6.5" cy="0" r="3.8"/><circle cx="3.2" cy="6" r="3.8"/>
      </g>
      <g transform="translate(65,219) rotate(-8)">
        <path d="M-2 -9 L2 -9 L2 -6 L3.5 -4 L3.5 9 L-3.5 9 L-3.5 -4 L-2 -6 Z" fill="#cde3e8" opacity="0.65"/>
        <rect x="-1.3" y="-11" width="2.6" height="2.5" fill="#9db8bb"/>
      </g>
      <g transform="translate(12,222)">
        <path d="M-6 -4 L5 -6 L8 3 L-2 7 L-8 1 Z" fill="#cfcfc7"/>
        <path d="M-4 -2 L4 1 M-1 3 L5 -3" stroke="#a9a99f" stroke-width="0.7"/>
      </g>
      <g transform="translate(28,233)">
        <path d="M-7 0 Q-3 -7 4 -5 Q8 -2 6 3 Q0 7 -7 0 Z" fill="#c9a13a"/>
        <path d="M-4 -1 Q0 -4 3 -2" stroke="#8a6a1e" stroke-width="0.8" fill="none"/>
      </g>
      <g opacity="0.85" fill="#2a2620">
        <circle cx="34" cy="227" r="0.9"/><circle cx="38" cy="231" r="0.7"/><circle cx="31" cy="232" r="0.7"/>
      </g>
      <g transform="translate(24,176)"><path d="M-4 -2 L3 -3 L4 2 L-2 4 Z" fill="#e9e2ce" opacity="0.85"/></g>
      <g transform="translate(108,182)"><path d="M-3 -2 L3 -1 L2 3 L-3 2 Z" fill="#dcd3ba" opacity="0.8"/></g>
      <g transform="translate(50,236)" fill="#e6e5df" opacity="0.85">
        <ellipse cx="0" cy="0" rx="4.5" ry="3.4"/>
        <circle cx="4" cy="-2.8" r="2"/>
        <path d="M5.6 -2.8 L9 -1.6 L5.8 -1 Z" fill="#c9820f" opacity="0.75"/>
        <path d="M-1 3.2 L-1.6 6 M2.2 3.2 L2.8 6" stroke="#9a9a90" stroke-width="0.6"/>
      </g>
      <g transform="translate(114,234) scale(0.8)" fill="#e6e5df" opacity="0.8">
        <ellipse cx="0" cy="0" rx="4.5" ry="3.4"/>
        <circle cx="-4" cy="-2.8" r="2"/>
        <path d="M-5.6 -2.8 L-9 -1.6 L-5.8 -1 Z" fill="#c9820f" opacity="0.75"/>
        <path d="M-1 3.2 L-1.6 6 M2.2 3.2 L2.8 6" stroke="#9a9a90" stroke-width="0.6"/>
      </g>
      <g transform="translate(6,206) rotate(100)" opacity="0.88">
        <rect x="-3" y="-11" width="6" height="20" rx="3" fill="#a3a698"/>
        <ellipse cx="0" cy="-11" rx="3" ry="1.1" fill="#84876f"/>
        <path d="M-3 3 L3 3" stroke="#84876f" stroke-width="0.8"/>
      </g>
      <g transform="translate(19,231) rotate(60)" opacity="0.9">
        <rect x="-3" y="-11" width="6" height="20" rx="3" fill="#b0aca0"/>
        <ellipse cx="0" cy="-11" rx="3" ry="1.1" fill="#8c8676"/>
        <path d="M-3 3 L3 3" stroke="#8c8676" stroke-width="0.8"/>
        <path d="M0 -11 Q1.5 -12 2.6 -10.6" stroke="#6f6a58" stroke-width="0.6" fill="none"/>
      </g>
      <g transform="translate(104,220) rotate(-10)" opacity="0.85">
        <path d="M-8 0 L-13 -3.5 L-13 3.5 Z" fill="#9fb0ac"/>
        <path d="M-8 0 Q-8 -3 -2 -3 Q4 -3 8 0 Q4 3 -2 3 Q-8 3 -8 0 Z" fill="#9fb0ac"/>
        <path d="M-2 -3 Q0 -5 3 -3.5" stroke="#7f8f8c" stroke-width="0.6" fill="none"/>
        <circle cx="-4" cy="-0.5" r="0.7" fill="#5c6b68"/>
        <path d="M3 -0.5 Q5.5 0 3 1.2" stroke="#7f8f8c" stroke-width="0.6" fill="none"/>
      </g>`;
  }
  if (key === "cleanbeach") {
    return `<rect x="0" y="0" width="120" height="240" fill="#fdf6e3"/>
      <path d="M0 60 Q60 40 120 60 L120 240 L0 240 Z" fill="#ffe9c7" opacity="0.6"/>
      <path d="M0 100 Q60 82 120 100 L120 240 L0 240 Z" fill="#ffd9ae" opacity="0.55"/>
      <path d="M0 135 Q60 118 120 135 L120 240 L0 240 Z" fill="#ffc9a8" opacity="0.55"/>
      <path d="M-10 34 Q10 25 28 34 Q46 25 62 34 Q46 40 28 38 Q10 40 -10 34 Z" fill="#ffffff" opacity="0.5"/>
      <path d="M64 16 Q82 9 100 16 Q90 21 78 19 Q70 21 64 16 Z" fill="#ffffff" opacity="0.4"/>
      <g stroke="var(--teal-900)" stroke-width="1.4" fill="none" opacity="0.4" stroke-linecap="round">
        <path d="M30 50 q4 -5 8 0 q4 -5 8 0"/>
        <path d="M80 70 q3 -4 6 0 q3 -4 6 0"/>
      </g>
      <circle cx="60" cy="128" r="44" fill="#ffb347" opacity="0.16"/>
      <circle cx="60" cy="128" r="30" fill="#ffb347" opacity="0.32"/>
      <circle cx="60" cy="128" r="19" fill="#ffa72b"/>
      <path d="M0 128 L120 128 L120 162 L0 162 Z" fill="#bfe0df"/>
      <path d="M0 145 L120 145 L120 162 L0 162 Z" fill="#a7d2d0" opacity="0.7"/>
      <g transform="translate(18,135)" opacity="0.55" fill="#5c4433">
        <path d="M-6 4 Q0 8 6 4 L5 2 L-5 2 Z"/>
        <rect x="-0.5" y="-9" width="1" height="11"/>
        <path d="M0 -9 L7 1 L0 1 Z"/>
      </g>
      <path d="M14 138 Q34 134 54 138 T94 138" stroke="#ffffff" stroke-width="1.1" fill="none" opacity="0.5"/>
      <path d="M10 150 Q32 146 56 150 T104 150" stroke="#ffffff" stroke-width="1.1" fill="none" opacity="0.45"/>
      <path d="M0 162 Q10 157 20 162 Q30 167 40 162 Q50 157 60 162 Q70 167 80 162 Q90 157 100 162 Q110 167 120 162 L120 240 L0 240 Z" fill="#f2e2c4"/>
      <path d="M0 162 Q10 157 20 162 Q30 167 40 162 Q50 157 60 162 Q70 167 80 162 Q90 157 100 162 Q110 167 120 162" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.55"/>
      <g opacity="0.5" fill="#c9a876">
        <circle cx="22" cy="196" r="1.4"/>
        <circle cx="88" cy="204" r="1.6"/>
        <circle cx="45" cy="220" r="1.3"/>
        <circle cx="100" cy="180" r="1.2"/>
        <circle cx="15" cy="215" r="1.5"/>
      </g>
      <path d="M84 188 Q92 184 100 188" stroke="#8a6a4a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.6"/>
      <g opacity="0.7" fill="#ffffff">
        <path d="M25 178 Q30 172 35 178 Q30 182 25 178 Z"/>
        <path d="M22 176 Q25 170 28 176 Z"/>
      </g>`;
  }
  if (key === "meadow") {
    return `<rect x="0" y="0" width="120" height="240" fill="#f6f9f8"/>
      <path d="M0 156 Q30 136 60 156 T120 156 L120 240 L0 240 Z" fill="#e3f4f1"/>
      <path d="M0 182 Q30 166 60 182 T120 182 L120 240 L0 240 Z" fill="#dcece8"/>
      <circle cx="20" cy="164" r="3" fill="var(--amber-500)"/>
      <circle cx="100" cy="168" r="3" fill="var(--amber-500)"/>
      <circle cx="36" cy="176" r="2.2" fill="var(--teal-700)"/>
      <circle cx="88" cy="180" r="2.2" fill="var(--teal-700)"/>
      <circle cx="55" cy="203" r="2.6" fill="var(--amber-500)"/>
      <circle cx="72" cy="213" r="2" fill="var(--teal-700)"/>`;
  }
  if (key === "stars") {
    return `<rect x="0" y="0" width="120" height="240" fill="var(--teal-900)" opacity="0.16"/>
      <circle cx="18" cy="22" r="1.7" fill="var(--amber-500)"/>
      <circle cx="100" cy="18" r="1.4" fill="var(--amber-500)"/>
      <circle cx="30" cy="102" r="1.4" fill="var(--amber-500)"/>
      <circle cx="106" cy="96" r="1.7" fill="var(--amber-500)"/>
      <circle cx="12" cy="70" r="1.3" fill="var(--amber-500)"/>
      <circle cx="92" cy="144" r="1.5" fill="var(--amber-500)"/>
      <circle cx="24" cy="174" r="1.3" fill="var(--amber-500)"/>
      <circle cx="70" cy="198" r="1.6" fill="var(--amber-500)"/>
      <circle cx="108" cy="220" r="1.3" fill="var(--amber-500)"/>`;
  }
  if (key === "aurora") {
    return `<rect x="0" y="0" width="120" height="240" fill="#eef6f4"/>
      <circle cx="60" cy="72" r="64" fill="#e3f4f1" opacity="0.5"/>
      <path d="M6 48 Q60 18 114 48" stroke="var(--amber-500)" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>
      <path d="M6 63 Q60 35 114 63" stroke="var(--teal-700)" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>
      <path d="M6 80 Q60 54 114 80" stroke="var(--amber-500)" stroke-width="2.4" fill="none" opacity="0.4" stroke-linecap="round"/>
      <path d="M0 166 Q60 144 120 166 L120 240 L0 240 Z" fill="var(--teal-100)" opacity="0.5"/>`;
  }
  // Cozy neo-Tokyo zen garden, jazzed up 2026-08-31 (per Eric, right after
  // Green Knoll's own redesign landed: "so good that it makes the rest of
  // the backgrounds pretty underwhelming... let's jazz up sakura garden,
  // make the ground look more like a sandy zen garden, add a couple more
  // Japanese decor options, make the sky beautiful"). The original version
  // was functional but plain: a flat teal-tinted wash for sky, a flat white
  // "ground" with a few thin straight rake lines, and just the torii +
  // cherry tree. This redraw, addressing each of Eric's three asks in turn:
  //   - **Sky**: layered translucent bands (blush pink over a peach/gold
  //     band over the pale lavender base) fake a soft dawn-gradient sky
  //     without real SVG gradients (still off-limits -- see the function
  //     comment above backgroundSvg()), plus a glowing sun and two Japanese-
  //     style wavy "kumo" cloud ribbons instead of Western fluffy clouds.
  //     A distant Mt.-Fuji-style silhouette went through three rounds of
  //     repositioning the same day (too close to the ground, then reading as
  //     poking through the torii's legs, then hidden entirely behind the
  //     tree canopy once moved to peek out from behind the sun) before Eric
  //     called it: "just remove the damn mountain." It's gone -- sun and sky
  //     alone carry the "beautiful sky" ask now. If a mountain ever comes
  //     back, note for next time: this scene's usable gap that doesn't
  //     collide with the torii, the tree, or Buddy himself is narrow (only
  //     the sliver around x40-70), which is exactly what made it so fiddly.
  //   - **Ground**: the flat white plane is now a warm sand tone with a
  //     slightly deeper foreground band for depth, and the rake pattern is
  //     no longer just straight parallel lines -- a few still run
  //     side-to-side for texture, but most now curve in loose concentric
  //     arcs around the new rock cluster (see below), the way a real
  //     karesansui garden is actually raked around its stones.
  //   - **Two more decor pieces**: a stone lantern (toro) on the left,
  //     grounded on the sand beneath the torii, and a three-stone rock
  //     cluster with a little moss on the right, grounded beneath the
  //     cherry tree -- so each existing background element now has a
  //     matching ground-level companion instead of the sand being empty
  //     underneath them. Both sit clear of where Buddy actually stands
  //     (centered, feet around y160-170 -- see the creature-grounded-on-
  //     horizon round above), same principle as Green Knoll's tree/path
  //     placement.
  // All non-var colors are fixed hex, same reasoning as every other
  // background here -- this scene shouldn't recolor with dark mode.
  if (key === "sakuragarden") {
    return `<rect x="0" y="0" width="120" height="240" fill="#f4eef6"/>
      <path d="M0 50 Q60 32 120 50 L120 156 L0 156 Z" fill="#fbdfe6" opacity="0.5"/>
      <path d="M0 92 Q60 76 120 92 L120 156 L0 156 Z" fill="#ffdcb0" opacity="0.35"/>
      <circle cx="55" cy="50" r="28" fill="#ffe3c2" opacity="0.5"/>
      <circle cx="55" cy="50" r="16" fill="#ffd39a" opacity="0.85"/>
      <path d="M-10 40 Q10 30 30 40 Q50 30 68 40 Q50 46 30 44 Q10 46 -10 40 Z" fill="#ffffff" opacity="0.55"/>
      <path d="M62 20 Q82 12 104 20 Q92 26 78 24 Q68 26 62 20 Z" fill="#ffffff" opacity="0.4"/>
      <g fill="#f3c9d6" opacity="0.55">
        <circle cx="20" cy="24" r="1.5"/>
        <circle cx="42" cy="14" r="1.3"/>
        <circle cx="100" cy="30" r="1.4"/>
      </g>
      <g opacity="0.85">
        <rect x="12" y="57" width="3" height="34" fill="#a0453c"/>
        <rect x="27" y="57" width="3" height="34" fill="#a0453c"/>
        <rect x="9" y="57" width="24" height="4" fill="#a0453c"/>
        <rect x="7" y="49" width="28" height="4.5" rx="1" fill="#a0453c"/>
      </g>
      <path d="M91 116 Q87 90 92 66 Q94 56 90 48 Q99 54 97 66 Q93 92 97 116 Z" fill="#6b4a3a"/>
      <path d="M93 66 Q100 56 108 50" stroke="#6b4a3a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M92 62 Q84 54 78 46" stroke="#6b4a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M94 58 Q96 46 92 36" stroke="#6b4a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <circle cx="108" cy="48" r="13" fill="#f3c9d6"/>
      <circle cx="118" cy="54" r="10" fill="#e88fae"/>
      <circle cx="112" cy="62" r="9" fill="#e88fae"/>
      <circle cx="96" cy="34" r="11" fill="#f3c9d6"/>
      <circle cx="82" cy="42" r="10" fill="#eda3bd"/>
      <circle cx="76" cy="52" r="8" fill="#e88fae"/>
      <circle cx="90" cy="50" r="12" fill="#eda3bd"/>
      <circle cx="100" cy="58" r="9" fill="#f3c9d6"/>
      <g fill="#e0688f" opacity="0.7">
        <circle cx="122" cy="48" r="2"/>
        <circle cx="70" cy="46" r="2"/>
        <circle cx="104" cy="26" r="1.8"/>
        <circle cx="118" cy="68" r="1.8"/>
        <circle cx="72" cy="58" r="1.8"/>
      </g>
      <path d="M0 156 L120 156 L120 240 L0 240 Z" fill="#f2ead9"/>
      <path d="M0 208 L120 208 L120 240 L0 240 Z" fill="#ece0c8" opacity="0.55"/>
      <path d="M8 164 Q60 157 112 164" stroke="#e6dcc2" stroke-width="1.3" fill="none" opacity="0.7"/>
      <path d="M8 174 Q60 167 112 174" stroke="#e6dcc2" stroke-width="1.3" fill="none" opacity="0.7"/>
      <path d="M60 183 Q95 168 130 183" stroke="#d8c9a8" stroke-width="1.3" fill="none" opacity="0.75"/>
      <path d="M55 195 Q95 179 140 195" stroke="#d8c9a8" stroke-width="1.3" fill="none" opacity="0.75"/>
      <path d="M50 207 Q95 189 145 207" stroke="#d8c9a8" stroke-width="1.3" fill="none" opacity="0.75"/>
      <path d="M45 219 Q95 199 150 219" stroke="#d8c9a8" stroke-width="1.2" fill="none" opacity="0.7"/>
      <path d="M8 231 Q60 224 112 231" stroke="#e6dcc2" stroke-width="1.3" fill="none" opacity="0.7"/>
      <g opacity="0.92">
        <rect x="14" y="208" width="12" height="8" rx="1.5" fill="#847e6f"/>
        <rect x="17" y="178" width="6" height="30" fill="#948e7e"/>
        <rect x="12" y="160" width="16" height="18" rx="2" fill="#948e7e"/>
        <rect x="16" y="164" width="8" height="10" rx="1" fill="#5c574c" opacity="0.6"/>
        <rect x="9" y="158" width="22" height="3" rx="1.5" fill="#847e6f"/>
        <path d="M9 158 L20 146 L31 158 Z" fill="#847e6f"/>
        <circle cx="20" cy="145" r="2" fill="#847e6f"/>
      </g>
      <circle cx="17" cy="212" r="3" fill="var(--teal-700)" opacity="0.5"/>
      <circle cx="24" cy="214" r="2.2" fill="var(--teal-500)" opacity="0.5"/>
      <g opacity="0.92">
        <ellipse cx="92" cy="221" rx="16" ry="4" fill="#8a8578" opacity="0.3"/>
        <ellipse cx="92" cy="214" rx="16" ry="11" fill="#a8a297"/>
        <ellipse cx="104" cy="208" rx="11" ry="8" fill="#b7b2a5"/>
        <ellipse cx="86" cy="222" rx="8" ry="6" fill="#c2bdae"/>
      </g>
      <circle cx="88" cy="220" r="3" fill="var(--teal-700)" opacity="0.5"/>
      <circle cx="98" cy="224" r="2.3" fill="var(--teal-500)" opacity="0.5"/>
      <g fill="#f3c9d6" opacity="0.9">
        <circle cx="40" cy="37" r="2"/>
        <circle cx="60" cy="28" r="1.6"/>
        <circle cx="72" cy="92" r="2"/>
        <circle cx="20" cy="74" r="1.6"/>
        <circle cx="50" cy="146" r="1.8"/>
        <circle cx="60" cy="170" r="1.5"/>
        <circle cx="42" cy="196" r="1.6"/>
        <circle cx="78" cy="230" r="1.7"/>
      </g>`;
  }
  // Sunny knoll, redrawn from scratch 2026-08-31 (per Eric: "a fresh go at
  // the green knoll background idea" after the ground-line/tall-canvas
  // rounds above). The original version was the least-developed of the six
  // -- a flat amber sky wash, one small sun, two washed-out low-opacity hill
  // overlays, and a two-circle tree -- built before any of the lessons from
  // this session's other three rounds existed. This redraw applies all
  // three on purpose:
  //   1. Composed for the full 120x240 canvas from the start (four full-
  //      width hill bands, each its own solid, distinct green, stacked back
  //      to front) rather than the older approach of stretching a couple of
  //      thin low-opacity bands and hoping they read as depth.
  //   2. The pet's feet land around y155-170 on this canvas (see the
  //      creature-grounded-on-horizon round above -- `bottom: 27%` plus each
  //      stage's own foot padding). The third hill band's top edge sits at
  //      y~158-168, specifically so the pet is standing ON a solid green
  //      band's own color, not straddling a seam between two bands or still
  //      up in a lighter/farther one.
  //   3. Real depth and detail to match the other five (especially
  //      sakuragarden's layered torii/tree/petals) instead of reading as the
  //      simplest, least-finished option in the unlock grid: a soft sun with
  //      its own glow, two drifting clouds, a longer winding path with a
  //      visible pebble-tan color, a fuller multi-lobed tree (was two flat
  //      circles, now four layered ones in two greens for real canopy
  //      shape), a couple of simple birds, and scattered flower/clover dots
  //      at the pet's own ground level so that band reads as grass underfoot
  //      rather than an empty color field.
  // All non-var colors are fixed hex on purpose (not --teal-100/--amber-100/
  // --card-bg/--border), same reasoning as every other background here --
  // this scene shouldn't recolor with dark mode. var(--amber-500)/
  // var(--teal-700)/var(--teal-500)/var(--teal-900) are reused freely since
  // those four are already fixed across both themes.
  //
  // Three more passes the same day, all per Eric after seeing the first
  // redraw above:
  //   - **The path used to just run straight up and stop** partway up the
  //     first hill band, reading as a dead end rather than a path receding
  //     into the distance. First attempt curled its top end into a small
  //     hook/loop meant to read as cresting a rise and heading down the far
  //     side -- Eric's call on that one: "looks odd." Simpler fix that
  //     stuck: the path's top end is now tucked at (70, 128), squarely
  //     behind where the creature layer renders on top of this backdrop
  //     (`.pet-stage-art`, centered around x=60 and spanning down through
  //     this same region -- see the full-screen redesign section above for
  //     why background and creature are separate layers to begin with). No
  //     hook needed -- the path simply runs up and disappears behind Buddy,
  //     same as it visually disappears behind any of the foreground hills
  //     lower down. If the path ever looks like it pokes out from behind the
  //     creature again (e.g. if the creature's centering/sizing changes),
  //     nudge this endpoint, not the hills.
  //   - **The tree was rooted too far down** (trunk base at y210, well below
  //     where the pet actually stands at ~y160-170), so it read as sitting
  //     apart from/below the pet rather than next to it. Trunk and canopy are
  //     both shifted up ~40px (trunk now y125-170, canopy circles centered
  //     ~y100-120) so the tree's base lands at the same ground level the pet
  //     is standing on.
  if (key === "greenknoll") {
    return `<rect x="0" y="0" width="120" height="240" fill="#f3f7e6"/>
      <circle cx="94" cy="34" r="26" fill="var(--amber-500)" opacity="0.18"/>
      <circle cx="94" cy="34" r="15" fill="var(--amber-500)" opacity="0.6"/>
      <g opacity="0.85" fill="#ffffff">
        <ellipse cx="26" cy="42" rx="12" ry="7"/>
        <ellipse cx="36" cy="40" rx="9" ry="6"/>
        <ellipse cx="18" cy="44" rx="8" ry="5.5"/>
      </g>
      <g opacity="0.65" fill="#ffffff">
        <ellipse cx="62" cy="20" rx="9" ry="5"/>
        <ellipse cx="70" cy="19" rx="6" ry="4"/>
      </g>
      <g stroke="var(--teal-900)" stroke-width="1.3" fill="none" opacity="0.45" stroke-linecap="round">
        <path d="M44 26 q4 -5 8 0 q4 -5 8 0"/>
        <path d="M60 44 q3 -4 6 0 q3 -4 6 0"/>
      </g>
      <path d="M0 92 Q30 72 60 90 T120 86 L120 240 L0 240 Z" fill="#e4f3da"/>
      <path d="M0 132 Q30 112 60 130 T120 126 L120 240 L0 240 Z" fill="#c3e6b0"/>
      <path d="M0 162 Q30 142 60 160 T120 156 L120 240 L0 240 Z" fill="#9ed488"/>
      <path d="M0 200 Q30 182 60 198 T120 194 L120 240 L0 240 Z" fill="#78bd68"/>
      <path d="M70 128 Q86 138 72 156 Q62 170 70 188 Q78 204 66 222 Q60 232 64 240" fill="none" stroke="#e9dcb0" stroke-width="7" stroke-linecap="round" opacity="0.9"/>
      <path d="M70 128 Q86 138 72 156 Q62 170 70 188 Q78 204 66 222 Q60 232 64 240" fill="none" stroke="#cdbb86" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
      <rect x="17" y="125" width="5" height="45" rx="2" fill="#6b4a3a"/>
      <circle cx="19" cy="110" r="20" fill="var(--teal-700)" opacity="0.55"/>
      <circle cx="8" cy="120" r="15" fill="var(--teal-700)" opacity="0.6"/>
      <circle cx="19" cy="100" r="16" fill="var(--teal-500)" opacity="0.7"/>
      <circle cx="32" cy="118" r="14" fill="var(--teal-500)" opacity="0.65"/>
      <g opacity="0.9">
        <circle cx="45" cy="172" r="2.2" fill="var(--amber-500)"/>
        <circle cx="95" cy="180" r="2" fill="var(--amber-500)"/>
        <circle cx="55" cy="210" r="2.4" fill="var(--amber-500)"/>
        <circle cx="30" cy="222" r="2" fill="var(--teal-900)" opacity="0.5"/>
        <circle cx="100" cy="215" r="2.2" fill="var(--teal-900)" opacity="0.5"/>
      </g>`;
  }
  return ""; // none -- lets the pet stage's own flat --bg show through
}

// Accessory art, drawn last so it sits on top of the creature (shades,
// goggles, etc. in particular need to cover the plain eye circles beneath
// them). Deliberately flat colors -- see the no-gradients note above.
//
// Like backgroundSvg() above, these are deliberately fixed colors, not
// --ink/--card-bg/--amber-100 theme vars -- fixed 2026-08-30 per Eric so an
// accessory (shades, a mask, glasses frames...) doesn't flip to a near-white
// color in dark mode the way the pet's mouth used to. --pet-ink/--pet-light
// are the same fixed tokens the face uses; var(--amber-500)/var(--teal-700)
// are left alone since those two were already fixed across both themes.
function accessorySvg(key) {
  if (key === "pacifier") {
    return `<circle cx="60" cy="77" r="7" fill="#fbecd3" stroke="var(--amber-500)" stroke-width="1.8"/><line x1="60" y1="83.5" x2="60" y2="86" stroke="var(--amber-500)" stroke-width="2"/><circle cx="60" cy="90" r="4.5" fill="none" stroke="var(--amber-500)" stroke-width="2.2"/>`;
  }
  if (key === "shades") {
    return `<rect x="42" y="59" width="16" height="10" rx="4" fill="var(--pet-ink)"/><rect x="62" y="59" width="16" height="10" rx="4" fill="var(--pet-ink)"/><line x1="58" y1="63" x2="62" y2="63" stroke="var(--pet-ink)" stroke-width="2"/>`;
  }
  if (key === "clownnose") {
    return `<circle cx="60" cy="71" r="6.5" fill="#d64b3a"/><circle cx="57.5" cy="68.5" r="1.6" fill="#f2a898" opacity="0.8"/>`;
  }
  if (key === "bowtie") {
    return `<path d="M52 84 L60 88 L52 92 Z" fill="var(--amber-500)"/><path d="M68 84 L60 88 L68 92 Z" fill="var(--amber-500)"/><circle cx="60" cy="88" r="2" fill="#fbecd3"/>`;
  }
  if (key === "eyepatch") {
    return `<path d="M40 58 L58 55 L58 72 L41 70 Z" fill="var(--pet-ink)"/><line x1="41" y1="60" x2="31" y2="55" stroke="var(--pet-ink)" stroke-width="2" stroke-linecap="round"/><line x1="41" y1="66" x2="27" y2="76" stroke="var(--pet-ink)" stroke-width="2" stroke-linecap="round"/>`;
  }
  if (key === "skimask") {
    return `<ellipse cx="60" cy="68" rx="35" ry="32" fill="var(--pet-ink)"/><circle cx="49" cy="64" r="6" fill="var(--pet-light)" opacity="0.9"/><circle cx="71" cy="64" r="6" fill="var(--pet-light)" opacity="0.9"/><path d="M52 78 Q60 84 68 78" stroke="var(--pet-light)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.9"/>`;
  }
  if (key === "crown") {
    return `<path d="M44 40 L48 30 L54 38 L60 28 L66 38 L72 30 L76 40 Z" fill="var(--amber-500)"/><circle cx="48" cy="30" r="1.8" fill="var(--teal-700)"/><circle cx="60" cy="28" r="1.8" fill="var(--teal-700)"/><circle cx="72" cy="30" r="1.8" fill="var(--teal-700)"/>`;
  }
  if (key === "goggles") {
    return `<circle cx="49" cy="64" r="9" fill="var(--pet-light)" stroke="var(--amber-500)" stroke-width="2.5"/><circle cx="71" cy="64" r="9" fill="var(--pet-light)" stroke="var(--amber-500)" stroke-width="2.5"/><line x1="58" y1="64" x2="62" y2="64" stroke="var(--amber-500)" stroke-width="2.5"/><line x1="40" y1="59" x2="30" y2="52" stroke="var(--amber-500)" stroke-width="2" stroke-linecap="round"/><line x1="80" y1="59" x2="90" y2="52" stroke="var(--amber-500)" stroke-width="2" stroke-linecap="round"/>`;
  }
  if (key === "roundglasses") {
    return `<circle cx="49" cy="64" r="7" fill="none" stroke="var(--pet-ink)" stroke-width="1.6"/><circle cx="71" cy="64" r="7" fill="none" stroke="var(--pet-ink)" stroke-width="1.6"/><line x1="56" y1="64" x2="64" y2="64" stroke="var(--pet-ink)" stroke-width="1.6"/>`;
  }
  if (key === "catglasses") {
    return `<path d="M37 60 Q49 52 60 63 Q49 73 37 67 Z" fill="none" stroke="var(--pet-ink)" stroke-width="1.8" stroke-linejoin="round"/><path d="M83 60 Q71 52 60 63 Q71 73 83 67 Z" fill="none" stroke="var(--pet-ink)" stroke-width="1.8" stroke-linejoin="round"/><line x1="58" y1="63" x2="62" y2="63" stroke="var(--pet-ink)" stroke-width="1.8"/>`;
  }
  if (key === "monocle") {
    return `<circle cx="71" cy="64" r="7" fill="none" stroke="var(--amber-500)" stroke-width="1.8"/><path d="M77.5 70 Q83 78 78 87" stroke="var(--amber-500)" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  }
  if (key === "mustache") {
    return `<path d="M45 74 Q52 69 60 74 Q68 69 75 74 Q68 79 60 75.5 Q52 79 45 74 Z" fill="var(--pet-ink)"/>`;
  }
  if (key === "tophat") {
    return `<rect x="46" y="20" width="28" height="20" rx="2" fill="var(--pet-ink)"/><rect x="39" y="38" width="42" height="6" rx="2" fill="var(--pet-ink)"/><rect x="46" y="33" width="28" height="4" fill="var(--amber-500)"/>`;
  }
  // "Hi, My Name Is..." meeting-style sticker badge, sitting low and just
  // left of center -- roughly where a breast pocket would be on the body
  // ellipse below the face. Hardcoded cream + red like clownnose above,
  // since a badge sticker shouldn't recolor with the theme.
  if (key === "namebadge") {
    // Sized up substantially (2026-08-31, per Eric) -- the original badge
    // (26x17, tucked to one side) read as an unreadable smudge at pet-card
    // and pet-unlock-grid scale. Now spans nearly the full chest, centered,
    // still clear of the mouth above it (mouth sits ~y76-82; this starts at
    // y76 but the text itself doesn't start until the mouth is well clear).
    return `<g>
      <rect x="30" y="76" width="60" height="24" rx="3" fill="#fdf6ea" stroke="#d8c9a3" stroke-width="1.4"/>
      <circle cx="60" cy="76" r="2" fill="#b7b0a0"/>
      <text x="60" y="88" text-anchor="middle" font-size="11" font-weight="800" fill="#d64b3a">HI</text>
      <line x1="36" y1="92.5" x2="84" y2="92.5" stroke="#d64b3a" stroke-width="1.3"/>
      <text x="60" y="98" text-anchor="middle" font-size="5" font-weight="700" fill="#7a6f56" letter-spacing="0.3">MY NAME IS</text>
    </g>`;
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

/* ---------- pet full-screen stage + accessory/background picker ---------- */

function openPetModal() {
  document.getElementById("petPickerModal").classList.add("hidden");
  renderPetModal();
  document.getElementById("petModal").classList.remove("hidden");
}

function closePetModal() {
  document.getElementById("petModal").classList.add("hidden");
}

function renderPetModal() {
  const { level, intoLevel, neededForNext, pct } = xpProgress();
  const stage = petStageForLevel(level);

  // Backdrop and creature are rendered as two separate layers here (unlike
  // the small pet-card icon, which still uses the single composited
  // petSvg()) so the backdrop can crop to fill the full-screen stage edge to
  // edge while the creature itself stays undistorted and fully visible,
  // centered on top of it. The backdrop uses backgroundSvgTall()'s taller
  // 120x240 canvas (not backgroundSvg()'s square 120x120) so covering an
  // actual phone screen only needs a mild crop -- see backgroundSvgTall()'s
  // own comment for why a second, taller-canvas art set exists at all.
  document.getElementById("petModalBg").innerHTML =
    `<svg viewBox="0 0 120 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${backgroundSvgTall(data.equippedBackground)}</svg>`;
  document.getElementById("petModalArt").innerHTML = petSvg(stage.key, data.equippedAccessory, "none");

  const nameInput = document.getElementById("petNameInput");
  if (document.activeElement !== nameInput) {
    nameInput.value = data.petName || "";
  }

  document.getElementById("petModalStageLevel").textContent = `${stage.name} · Level ${level}`;
  document.getElementById("petModalXpBarFill").style.width = `${pct}%`;
  document.getElementById("petModalXpLabel").textContent = `${intoLevel} / ${neededForNext} XP to next level`;
  // Only a pet that's actually hatched (level 3+) has a real hatch date --
  // see the petBirthdate comment in defaultData() / awardXp(). Still-an-egg
  // pets just show nothing here (removed 2026-08-31, per Eric) rather than a
  // "hatches at level 3" hint.
  const petModalBirthdate = document.getElementById("petModalBirthdate");
  if (data.petBirthdate) {
    petModalBirthdate.textContent = `Hatched ${formatPretty(data.petBirthdate)}`;
    petModalBirthdate.classList.remove("hidden");
  } else {
    petModalBirthdate.classList.add("hidden");
  }
}

function openPetPicker(kind) {
  document.getElementById("petPickerTitle").textContent = kind === "accessory" ? "Accessories" : "Backgrounds";
  renderPetUnlockGrid(kind);
  document.querySelector(".pet-picker-scroll").scrollTop = 0;
  document.getElementById("petPickerModal").classList.remove("hidden");
}

function closePetPicker() {
  document.getElementById("petPickerModal").classList.add("hidden");
}

function renderPetUnlockGrid(kind) {
  const isAccessory = kind === "accessory";
  const items = isAccessory ? ACCESSORIES : BACKGROUNDS;
  const equippedKey = isAccessory ? data.equippedAccessory : data.equippedBackground;
  const container = document.getElementById("petPickerGrid");
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
    const lockedHint = item.unlock.type === "level" ? `Unlocks at level ${item.unlock.minLevel}` : item.unlock.label;

    tile.innerHTML = `
      <div class="pet-unlock-preview">${previewArt}</div>
      <span class="pet-unlock-name">${displayName}</span>
      <span class="pet-unlock-sub">${unlocked ? (equippedKey === item.key ? "Equipped" : "") : lockedHint}</span>
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
  renderPetUnlockGrid(kind);
}

function savePetName() {
  const input = document.getElementById("petNameInput");
  const name = input.value.trim().slice(0, 24);
  data.petName = name;
  saveData();
}

// Two separate daily rituals, split by the same 8pm boundary that used to
// just disable a single button: before 8pm it's the morning/afternoon
// pledge (one-time, no catch-up if skipped); after 8pm it's the evening
// "Mark today clean" confirmation (also one-time, but if it's skipped the
// day still quietly earns half credit later via processPastCleanDays() once
// it's fully in the past). Both are optional bonus XP on top of the streak,
// which keeps tracking itself automatically either way.
function renderCleanDayButton() {
  const pledgeBtn = document.getElementById("pledgeBtn");
  const pledgedBadge = document.getElementById("todayPledgedBadge");
  const cleanBtn = document.getElementById("markCleanBtn");
  const confirmedBadge = document.getElementById("todayConfirmedBadge");
  if (!pledgeBtn || !pledgedBadge || !cleanBtn || !confirmedBadge) return;

  const hasStarted = !!data.settings.quitDate;
  const isSlip = todayIsSlip();

  if (!hasStarted || isSlip) {
    pledgeBtn.classList.add("hidden");
    pledgedBadge.classList.add("hidden");
    cleanBtn.classList.add("hidden");
    confirmedBadge.classList.add("hidden");
    return;
  }

  if (!isEveningUnlocked()) {
    cleanBtn.classList.add("hidden");
    confirmedBadge.classList.add("hidden");
    if (todayPledged()) {
      pledgeBtn.classList.add("hidden");
      pledgedBadge.classList.remove("hidden");
    } else {
      pledgedBadge.classList.add("hidden");
      pledgeBtn.classList.remove("hidden");
    }
  } else {
    pledgeBtn.classList.add("hidden");
    pledgedBadge.classList.add("hidden");
    if (todayConfirmed()) {
      cleanBtn.classList.add("hidden");
      confirmedBadge.classList.remove("hidden");
    } else {
      confirmedBadge.classList.add("hidden");
      cleanBtn.classList.remove("hidden");
    }
  }
}

function handlePledge() {
  if (isEveningUnlocked() || todayPledged() || todayIsSlip()) return;
  const today = todayStr();
  data.pledgedDays.push(today);
  const beforeLevel = xpProgress().level;
  const result = awardXp(XP_PLEDGE);
  const newlyUnlocked = collectNewlyUnlockedLevelItems(beforeLevel, result.newLevel);
  // Green Knoll unlocks the moment a pledge happens for the first time ever,
  // independent of level -- see the "unlock" descriptor on BACKGROUNDS above.
  if (!data.eventUnlocks.firstPledge) {
    data.eventUnlocks.firstPledge = true;
    newlyUnlocked.push({ key: "greenknoll", name: "Green Knoll", kind: "background" });
  }
  saveData();
  renderCleanDayButton();
  renderPet();
  queueUnlockAnnouncements(newlyUnlocked);
  openFanfareModal(result, "pledge");
}

function handleMarkCleanDay() {
  if (!isEveningUnlocked() || todayConfirmed() || todayIsSlip()) return;
  const today = todayStr();
  data.confirmedDays.push(today);
  const beforeLevel = xpProgress().level;
  const result = awardXp(XP_CLEAN_DAY);
  const newlyUnlocked = collectNewlyUnlockedLevelItems(beforeLevel, result.newLevel);
  // "Hi, My Name Is..." unlocks the first time a day is ever marked clean,
  // independent of level -- see the "unlock" descriptor on ACCESSORIES above.
  if (!data.eventUnlocks.firstMarkClean) {
    data.eventUnlocks.firstMarkClean = true;
    newlyUnlocked.push({ key: "namebadge", name: "Hi, My Name Is...", kind: "accessory" });
  }
  saveData();
  renderCleanDayButton();
  renderPet();
  renderCalendar();
  queueUnlockAnnouncements(newlyUnlocked);
  openFanfareModal(result, "clean");
}

// kind is "pledge" (before 8pm), "clean" (after 8pm, the default), or
// "journal" (a journal entry itself earned the XP) -- each gets its own
// prompt/actions below since "want to write down how today went" only makes
// sense for one of the three.
function openFanfareModal(result, kind) {
  document.getElementById("fanfareXpLine").textContent = `+${result.gained} XP for today`;
  document.getElementById("fanfareLevelUp").classList.toggle("hidden", !result.leveledUp);
  if (result.leveledUp) {
    document.getElementById("fanfareLevelUp").textContent = `Level up! ${result.newLevel}`;
  }

  const promptEl = document.getElementById("fanfarePrompt");
  const journalBtn = document.getElementById("fanfareJournalBtn");
  const notNowBtn = document.getElementById("fanfareNotNowBtn");

  if (kind === "pledge") {
    const pick = PLEDGE_ENCOURAGEMENTS[Math.floor(Math.random() * PLEDGE_ENCOURAGEMENTS.length)];
    promptEl.textContent = pick.author ? `"${pick.text}" — ${pick.author}` : pick.text;
    promptEl.classList.add("fanfare-quote");
    journalBtn.classList.add("hidden");
    notNowBtn.textContent = "Let's do this";
  } else if (kind === "journal") {
    promptEl.textContent = "Nice work checking in with yourself today.";
    promptEl.classList.remove("fanfare-quote");
    journalBtn.classList.add("hidden");
    notNowBtn.textContent = "Nice!";
  } else {
    promptEl.textContent = "Want to write down how today went?";
    promptEl.classList.remove("fanfare-quote");
    journalBtn.classList.remove("hidden");
    notNowBtn.textContent = "Not now";
  }

  document.getElementById("fanfareModal").classList.remove("hidden");
}

function closeFanfareModal() {
  document.getElementById("fanfareModal").classList.add("hidden");
  // Any unlock earned by the same action waits behind the fanfare modal,
  // never on top of it -- surface it now that the fanfare modal is gone.
  showNextUnlockAnnouncement();
}

/* ---------- unlock announcement modal ---------- */

// Queues one or more newly-unlocked items to be announced, one at a time,
// via showNextUnlockAnnouncement(). Only ever called from a live user
// action (handlePledge, handleMarkCleanDay, the journal-save handler) --
// the silent history backfill in applyEventUnlockBackfill() never calls
// this, per the rule that only in-the-moment actions get a celebratory
// popup.
function queueUnlockAnnouncements(items) {
  if (!items || items.length === 0) return;
  pendingUnlockAnnouncements.push(...items);
}

// Pops the next queued unlock and shows it. Called once when the fanfare
// modal closes, and again each time the unlock modal itself is dismissed,
// to drain the rest of the queue. Once the queue is empty, resumes the
// deferred "add a journal entry" flow if one was waiting on it.
function showNextUnlockAnnouncement() {
  if (pendingUnlockAnnouncements.length === 0) {
    if (openJournalAfterUnlocks) {
      openJournalAfterUnlocks = false;
      openDayModal(todayStr());
    }
    return;
  }
  const item = pendingUnlockAnnouncements.shift();
  renderUnlockModal(item);
  document.getElementById("unlockModal").classList.remove("hidden");
}

function renderUnlockModal(item) {
  const { level } = xpProgress();
  const stage = petStageForLevel(level);
  // Same "show it against whatever's currently equipped in the other slot"
  // approach as the unlock grid, so the preview looks like how it'll
  // actually sit on the pet once equipped.
  const preview = item.kind === "accessory"
    ? petSvg(stage.key, item.key, data.equippedBackground)
    : petSvg(stage.key, data.equippedAccessory, item.key);
  document.getElementById("unlockPreview").innerHTML = preview;
  document.getElementById("unlockName").textContent = item.name;
  document.getElementById("unlockKindLabel").textContent =
    item.kind === "accessory" ? "New accessory unlocked" : "New background unlocked";
}

function handleUnlockGotIt() {
  document.getElementById("unlockModal").classList.add("hidden");
  showNextUnlockAnnouncement();
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
  document.getElementById("pledgeBtn").addEventListener("click", handlePledge);
  document.getElementById("markCleanBtn").addEventListener("click", handleMarkCleanDay);

  // Fanfare modal
  document.getElementById("fanfareClose").addEventListener("click", closeFanfareModal);
  document.getElementById("fanfareModal").addEventListener("click", (e) => {
    if (e.target.id === "fanfareModal") closeFanfareModal();
  });
  document.getElementById("fanfareNotNowBtn").addEventListener("click", closeFanfareModal);
  document.getElementById("fanfareJournalBtn").addEventListener("click", () => {
    // If this same action also unlocked something, let the unlock modal(s)
    // show first and open the journal entry once the queue drains -- see
    // showNextUnlockAnnouncement(). Otherwise open it right away, same as
    // before.
    if (pendingUnlockAnnouncements.length > 0) {
      openJournalAfterUnlocks = true;
      closeFanfareModal();
    } else {
      closeFanfareModal();
      openDayModal(todayStr());
    }
  });

  // Unlock announcement modal
  document.getElementById("unlockGotItBtn").addEventListener("click", handleUnlockGotIt);
  document.getElementById("unlockModal").addEventListener("click", (e) => {
    if (e.target.id === "unlockModal") handleUnlockGotIt();
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
  document.getElementById("openAccessoryPickerBtn").addEventListener("click", () => openPetPicker("accessory"));
  document.getElementById("openBackgroundPickerBtn").addEventListener("click", () => openPetPicker("background"));
  document.getElementById("petPickerBack").addEventListener("click", closePetPicker);

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
    let newlyUnlocked = [];
    if (note && !data.journalXpDates.includes(dateStr)) {
      const beforeLevel = xpProgress().level;
      data.journalXpDates.push(dateStr);
      leveledResult = awardXp(XP_JOURNAL_ENTRY);
      newlyUnlocked = collectNewlyUnlockedLevelItems(beforeLevel, leveledResult.newLevel);
      // Sakura Garden unlocks the moment a journal entry is ever written,
      // independent of level -- see the "unlock" descriptor on BACKGROUNDS.
      if (!data.eventUnlocks.firstJournal) {
        data.eventUnlocks.firstJournal = true;
        newlyUnlocked.push({ key: "sakuragarden", name: "Sakura Garden", kind: "background" });
      }
    }
    saveData();
    closeDayModal();
    renderCalendar();
    renderPet();
    queueUnlockAnnouncements(newlyUnlocked);
    if (leveledResult) openFanfareModal(leveledResult, "journal");
    else showNextUnlockAnnouncement();
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
        pledgedDays: Array.isArray(parsed.pledgedDays) ? parsed.pledgedDays.slice().sort() : [],
        journalXpDates: Array.isArray(parsed.journalXpDates) ? parsed.journalXpDates.slice().sort() : [],
        autoXpDates: Array.isArray(parsed.autoXpDates) ? parsed.autoXpDates.slice().sort() : [],
        xpResetApplied: typeof parsed.xpResetApplied === "boolean" ? parsed.xpResetApplied : false,
        petName: typeof parsed.petName === "string" ? parsed.petName : "",
        petBirthdate: typeof parsed.petBirthdate === "string" ? parsed.petBirthdate : null,
        equippedAccessory: typeof parsed.equippedAccessory === "string" ? parsed.equippedAccessory : "none",
        equippedBackground: typeof parsed.equippedBackground === "string" ? parsed.equippedBackground : "sunrise",
        eventUnlocks: parseEventUnlocks(parsed.eventUnlocks),
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
