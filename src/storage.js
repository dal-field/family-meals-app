import {
  DAYS,
  RECURRING_SLOTS,
  SEED_MEALS,
  SEED_PLAN,
  SLOTS,
  emptyRecurring,
  emptySlot,
  emptySlots,
  normalizeIngredients,
  isInCurrentPlanWeek,
  rollingDays,
  storeKey,
  todayDayId,
} from "./data.js";

const KEYS = {
  userMeals: "fm.userMeals",
  seedEdits: "fm.seedEdits",
  hidden: "fm.hiddenSeedIds",
  plan: "fm.weeklyPlan",
  grocery: "fm.grocery",
  migrations: "fm.migrations",
  familyCode: "fm.familyCode",
};

const SEED_IDS = new Set(SEED_MEALS.map((meal) => meal.id));

function isUserCreatedMeal(id, record) {
  return String(id || "").startsWith("user-") || record?.seed === false;
}

function shouldClearSeedNotes(id, record) {
  if (!id || isUserCreatedMeal(id, record)) return false;
  return SEED_IDS.has(id) || record?.seed === true;
}

export function clearImprovisedSeedNotes({ seedEdits = {}, userMeals = [] } = {}) {
  let changed = false;
  const nextEdits = {};
  for (const [id, edit] of Object.entries(seedEdits || {})) {
    if (edit && typeof edit === "object" && shouldClearSeedNotes(id, edit) && edit.notes) {
      nextEdits[id] = { ...edit, notes: "" };
      changed = true;
    } else {
      nextEdits[id] = edit;
    }
  }

  const nextMeals = (Array.isArray(userMeals) ? userMeals : []).map((meal) => {
    if (!meal || !shouldClearSeedNotes(meal.id, meal) || !meal.notes) return meal;
    changed = true;
    return { ...meal, notes: "" };
  });

  return { seedEdits: nextEdits, userMeals: nextMeals, changed };
}

function migrateClearSeedNotes() {
  const flags = read(KEYS.migrations, {});
  if (flags.clearSeedNotes) return;

  const currentEdits = read(KEYS.seedEdits, {});
  const currentMeals = read(KEYS.userMeals, []);
  const { seedEdits, userMeals, changed } = clearImprovisedSeedNotes({
    seedEdits: currentEdits,
    userMeals: currentMeals,
  });
  if (changed) {
    write(KEYS.seedEdits, seedEdits);
    write(KEYS.userMeals, userMeals);
  }
  write(KEYS.migrations, { ...flags, clearSeedNotes: 1 });
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function migrateStoredIngredients() {
  const meals = read(KEYS.userMeals, []);
  if (Array.isArray(meals) && meals.some((meal) => meal && typeof meal.ingredients === "string")) {
    write(
      KEYS.userMeals,
      meals.map((meal) =>
        meal && typeof meal.ingredients === "string"
          ? { ...meal, ingredients: normalizeIngredients(meal.ingredients) }
          : meal
      )
    );
  }

  const edits = read(KEYS.seedEdits, {});
  if (edits && typeof edits === "object") {
    let changed = false;
    const next = { ...edits };
    for (const [id, edit] of Object.entries(edits)) {
      if (edit && typeof edit.ingredients === "string") {
        next[id] = { ...edit, ingredients: normalizeIngredients(edit.ingredients) };
        changed = true;
      }
    }
    if (changed) write(KEYS.seedEdits, next);
  }
}

export function loadMeals() {
  migrateStoredIngredients();
  migrateClearSeedNotes();
  const userMeals = read(KEYS.userMeals, []);
  const seedEdits = read(KEYS.seedEdits, {});
  const hidden = new Set(read(KEYS.hidden, []));

  const seeds = SEED_MEALS.map((meal) => {
    const edit = seedEdits[meal.id] || {};
    return {
      ...meal,
      ...edit,
      id: meal.id,
      seed: true,
      hidden: hidden.has(meal.id),
      ingredients: normalizeIngredients(edit.ingredients ?? meal.ingredients),
    };
  });

  const extras = userMeals
    .filter((meal) => meal && meal.id && !SEED_MEALS.some((seed) => seed.id === meal.id))
    .map((meal) => ({
      ...meal,
      seed: false,
      hidden: Boolean(meal.hidden),
      ingredients: normalizeIngredients(meal.ingredients),
    }));

  return [...seeds, ...extras];
}

export function saveUserMeal(meal) {
  const meals = read(KEYS.userMeals, []);
  const index = meals.findIndex((item) => item.id === meal.id);
  const next = {
    id: meal.id,
    name: meal.name,
    types: meal.types,
    notes: meal.notes || "",
    recipeUrl: meal.recipeUrl || "",
    ingredients: normalizeIngredients(meal.ingredients),
    makeAhead: Boolean(meal.makeAhead),
    seed: false,
  };
  if (index >= 0) meals[index] = next;
  else meals.push(next);
  write(KEYS.userMeals, meals);
}

export function saveSeedEdit(meal) {
  const edits = read(KEYS.seedEdits, {});
  edits[meal.id] = {
    name: meal.name,
    types: meal.types,
    notes: meal.notes || "",
    recipeUrl: meal.recipeUrl || "",
    ingredients: normalizeIngredients(meal.ingredients),
    makeAhead: Boolean(meal.makeAhead),
  };
  write(KEYS.seedEdits, edits);
}

export function deleteUserMeal(id) {
  write(
    KEYS.userMeals,
    read(KEYS.userMeals, []).filter((meal) => meal.id !== id)
  );
}

export function hideSeedMeal(id, hidden = true) {
  const ids = new Set(read(KEYS.hidden, []));
  if (hidden) ids.add(id);
  else ids.delete(id);
  write(KEYS.hidden, [...ids]);
}

function normalizeSlot(savedSlot) {
  if (!savedSlot || typeof savedSlot !== "object") return null;
  return {
    mealId: savedSlot.mealId ?? null,
    label: typeof savedSlot.label === "string" ? savedSlot.label : "",
  };
}

function dayFromSaved(savedDay) {
  const day = emptySlots();
  if (!savedDay || typeof savedDay !== "object") return day;
  for (const slot of SLOTS) {
    const next = normalizeSlot(savedDay[slot.id]);
    if (next) day[slot.id] = next;
  }
  return day;
}

function isOldWeekdayPlan(saved) {
  return Boolean(saved && !saved.version && DAYS.some((day) => saved[day.id]));
}

function dateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function weekdayFromDateKey(key) {
  return todayDayId(dateFromKey(key));
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekdayIdOf(day) {
  return day?.weekdayId || day?.id || day?.key || "";
}

function seedWeekdaySlots(dayId) {
  return {
    breakfast: clone(SEED_PLAN[dayId].breakfast),
    lunch: clone(SEED_PLAN[dayId].lunch),
    snack: clone(SEED_PLAN[dayId].snack),
    dinner: clone(SEED_PLAN[dayId].dinner),
  };
}

function seedWeekdays() {
  const weekdays = {};
  for (const day of DAYS) {
    weekdays[day.id] = seedWeekdaySlots(day.id);
  }
  return weekdays;
}

function seedCurrentWeekDinners(now) {
  const dinners = {};
  for (const day of rollingDays(now)) {
    if (day.seedable) dinners[day.key] = clone(SEED_PLAN[day.weekdayId].dinner);
  }
  return dinners;
}

function collectV3Dates(saved, now) {
  const dates = {};
  if (saved?.version === 3 && saved.dates && typeof saved.dates === "object") {
    for (const [key, value] of Object.entries(saved.dates)) {
      if (dateKey(key)) dates[key] = dayFromSaved(value);
    }
    return dates;
  }
  if (isOldWeekdayPlan(saved)) {
    for (const day of rollingDays(now)) {
      if (day.seedable && saved[day.weekdayId]) {
        dates[day.key] = dayFromSaved(saved[day.weekdayId]);
      }
    }
  }
  return dates;
}

export function freshPlan() {
  return { weekdays: seedWeekdays() };
}

export function migratePlanToV4(saved, now = new Date()) {
  if (saved?.version === 4 && saved.weekdays && typeof saved.weekdays === "object") {
    return normalizeV4(saved);
  }

  if (!saved) return freshPlan(now);

  const dates = collectV3Dates(saved, now);
  const weekdays = seedWeekdays();
  const visible = rollingDays(now);

  for (const meta of DAYS) {
    const matches = Object.entries(dates)
      .filter(([key]) => weekdayFromDateKey(key) === meta.id)
      .sort(([left], [right]) => left.localeCompare(right));
    if (!matches.length) continue;

    const visibleDay = visible.find((item) => item.weekdayId === meta.id);
    const preferred = visibleDay && dates[visibleDay.key]
      ? [visibleDay.key, dates[visibleDay.key]]
      : matches[matches.length - 1];
    const [key, day] = preferred;

    for (const slotId of RECURRING_SLOTS) {
      const stored = day[slotId];
      if (slotHasMeal(stored)) {
        weekdays[meta.id][slotId] = clone(stored);
      } else if (isInCurrentPlanWeek(dateFromKey(key), now)) {
        weekdays[meta.id][slotId] = clone(stored || emptySlot());
      }
    }
  }

  const dinners = {};
  for (const [key, day] of Object.entries(dates)) {
    dinners[key] = clone(day.dinner);
  }
  for (const day of rollingDays(now)) {
    if (day.seedable && !Object.prototype.hasOwnProperty.call(dinners, day.key)) {
      dinners[day.key] = clone(SEED_PLAN[day.weekdayId].dinner);
    }
  }

  return { weekdays, dinners };
}

function pickWeekdayDinner(dinners, weekdayId, now) {
  const visible = rollingDays(now);
  const visibleDay = visible.find((item) => item.weekdayId === weekdayId);
  if (visibleDay && dinners && Object.prototype.hasOwnProperty.call(dinners, visibleDay.key)) {
    return normalizeSlot(dinners[visibleDay.key]) || emptySlot();
  }

  const matches = Object.entries(dinners || {})
    .filter(([key]) => dateKey(key) && weekdayFromDateKey(key) === weekdayId)
    .sort(([left], [right]) => left.localeCompare(right));
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const slot = normalizeSlot(matches[i][1]);
    if (slotHasMeal(slot)) return slot;
  }
  return clone(SEED_PLAN[weekdayId].dinner);
}

export function migratePlanToV5(saved, now = new Date()) {
  if (saved?.version === 5 && saved.weekdays && typeof saved.weekdays === "object") {
    return normalizeV5(saved);
  }

  if (!saved) return freshPlan();

  const v4 = migratePlanToV4(saved, now);
  const weekdays = {};
  for (const day of DAYS) {
    const recurring = v4.weekdays?.[day.id] || emptyRecurring();
    weekdays[day.id] = {
      breakfast: normalizeSlot(recurring.breakfast) || emptySlot(),
      lunch: normalizeSlot(recurring.lunch) || emptySlot(),
      snack: normalizeSlot(recurring.snack) || emptySlot(),
      dinner: pickWeekdayDinner(v4.dinners, day.id, now),
    };
  }
  return { weekdays };
}

function normalizeV4(saved) {
  const weekdays = {};
  for (const day of DAYS) {
    const raw = saved.weekdays?.[day.id];
    if (raw && typeof raw === "object") {
      weekdays[day.id] = {
        breakfast: normalizeSlot(raw.breakfast) || emptySlot(),
        lunch: normalizeSlot(raw.lunch) || emptySlot(),
        snack: normalizeSlot(raw.snack) || emptySlot(),
      };
    } else {
      weekdays[day.id] = {
        breakfast: clone(SEED_PLAN[day.id].breakfast),
        lunch: clone(SEED_PLAN[day.id].lunch),
        snack: clone(SEED_PLAN[day.id].snack),
      };
    }
  }

  const dinners = {};
  if (saved.dinners && typeof saved.dinners === "object") {
    for (const [key, value] of Object.entries(saved.dinners)) {
      if (!dateKey(key)) continue;
      dinners[key] = normalizeSlot(value) || emptySlot();
    }
  }

  return { weekdays, dinners };
}

function normalizeV5(saved) {
  const weekdays = {};
  for (const day of DAYS) {
    const raw = saved.weekdays?.[day.id];
    if (raw && typeof raw === "object") {
      weekdays[day.id] = {
        breakfast: normalizeSlot(raw.breakfast) || emptySlot(),
        lunch: normalizeSlot(raw.lunch) || emptySlot(),
        snack: normalizeSlot(raw.snack) || emptySlot(),
        dinner: normalizeSlot(raw.dinner) || emptySlot(),
      };
    } else {
      weekdays[day.id] = seedWeekdaySlots(day.id);
    }
  }
  return { weekdays };
}

export function loadPlan(now = new Date()) {
  const saved = read(KEYS.plan, null);
  if (saved?.version === 5 && saved.weekdays && typeof saved.weekdays === "object") {
    return normalizeV5(saved);
  }
  const plan = migratePlanToV5(saved, now);
  write(KEYS.plan, { version: 5, weekdays: plan.weekdays });
  return plan;
}

export function resolveDayPlan(plan, day) {
  const weekdayId = weekdayIdOf(day);
  const weekday = plan.weekdays?.[weekdayId] || emptySlots();
  return {
    breakfast: clone(weekday.breakfast || emptySlot()),
    lunch: clone(weekday.lunch || emptySlot()),
    snack: clone(weekday.snack || emptySlot()),
    dinner: clone(weekday.dinner || emptySlot()),
  };
}

export function slotHasMeal(slot) {
  if (!slot || typeof slot !== "object") return false;
  return Boolean(slot.mealId || (typeof slot.label === "string" && slot.label.trim()));
}

export function dayHasMeals(plan, day) {
  const slots = resolveDayPlan(plan, day);
  return SLOTS.some((slot) => slotHasMeal(slots[slot.id]));
}

export function getPlanSlot(plan, day, slotId) {
  return resolveDayPlan(plan, day)[slotId] || emptySlot();
}

export function setPlanSlot(plan, day, slotId, value) {
  const next = normalizeSlot(value) || emptySlot();
  const weekdayId = weekdayIdOf(day);
  if (!weekdayId || !SLOTS.some((slot) => slot.id === slotId)) return emptySlot();
  if (!plan.weekdays) plan.weekdays = seedWeekdays();
  if (!plan.weekdays[weekdayId]) plan.weekdays[weekdayId] = emptySlots();
  plan.weekdays[weekdayId][slotId] = next;
  return next;
}

export function clearDayPlan(plan, day) {
  setPlanSlot(plan, day, "dinner", emptySlot());
  for (const slotId of RECURRING_SLOTS) {
    setPlanSlot(plan, day, slotId, emptySlot());
  }
  return resolveDayPlan(plan, day);
}

export function swapDaySlots(plan, fromDay, toDay, slotId) {
  if (!fromDay || !toDay || weekdayIdOf(fromDay) === weekdayIdOf(toDay)) return plan;
  if (!SLOTS.some((slot) => slot.id === slotId)) return plan;
  const held = clone(getPlanSlot(plan, fromDay, slotId));
  setPlanSlot(plan, fromDay, slotId, getPlanSlot(plan, toDay, slotId));
  setPlanSlot(plan, toDay, slotId, held);
  return plan;
}

export function savePlan(plan) {
  write(KEYS.plan, { version: 5, weekdays: plan.weekdays });
}

function normalizeGroceryItem(item) {
  if (!item || !item.id || !item.name) return null;
  return {
    id: String(item.id),
    name: String(item.name),
    checked: Boolean(item.checked),
  };
}

function normalizeGroceryStore(store) {
  if (!store || !store.id || !store.name) return null;
  return {
    id: String(store.id),
    name: String(store.name).trim(),
    items: Array.isArray(store.items) ? store.items.map(normalizeGroceryItem).filter(Boolean) : [],
  };
}

function legacyStoreLabel(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "No store";
}

export function migrateLegacyGrocery(saved) {
  const items = Array.isArray(saved?.items) ? saved.items : Array.isArray(saved?.extras) ? saved.extras : [];
  const customStores = Array.isArray(saved?.customStores) ? saved.customStores : [];
  const bucket = new Map();

  const touchStore = (rawName) => {
    const name = legacyStoreLabel(rawName);
    const key = storeKey(name);
    if (!bucket.has(key)) {
      bucket.set(key, { id: `s-${key}-${bucket.size}`, name, items: [] });
    }
    return bucket.get(key);
  };

  for (const raw of items) {
    const item = normalizeGroceryItem(raw);
    if (!item) continue;
    const legacyItem = raw && typeof raw === "object" ? raw : {};
    touchStore(legacyItem.store).items.push(item);
  }

  for (const rawName of customStores) {
    if (typeof rawName === "string" && rawName.trim()) touchStore(rawName);
  }

  return { stores: [...bucket.values()] };
}

export function loadGrocery() {
  const saved = read(KEYS.grocery, null);
  if (saved?.version === 3 && Array.isArray(saved.stores)) {
    return {
      stores: saved.stores.map(normalizeGroceryStore).filter(Boolean),
    };
  }

  const migrated = migrateLegacyGrocery(saved || {});
  if (saved?.version === 2 || (saved && !saved.version)) {
    write(KEYS.grocery, { version: 3, stores: migrated.stores });
  }
  return migrated;
}

export function saveGrocery(grocery) {
  write(KEYS.grocery, {
    version: 3,
    stores: grocery.stores,
  });
}

export function loadFamilyCode() {
  const raw = read(KEYS.familyCode, "");
  const code = String(raw || "").toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : "";
}

export function saveFamilyCode(code) {
  write(KEYS.familyCode, String(code || "").toUpperCase());
}

export function replaceUserMeals(meals) {
  write(
    KEYS.userMeals,
    (Array.isArray(meals) ? meals : []).map((meal) => ({
      id: meal.id,
      name: meal.name,
      types: meal.types,
      notes: meal.notes || "",
      recipeUrl: meal.recipeUrl || "",
      ingredients: normalizeIngredients(meal.ingredients),
      makeAhead: Boolean(meal.makeAhead),
      seed: false,
    }))
  );
}

export function replaceSeedEdits(edits) {
  write(KEYS.seedEdits, edits && typeof edits === "object" ? edits : {});
}

export function replaceHiddenSeedIds(ids) {
  write(KEYS.hidden, Array.isArray(ids) ? ids.filter(Boolean) : []);
}

export function applyRemoteMeals(meals) {
  const userMeals = [];
  const seedEdits = {};
  const hidden = [];
  for (const meal of Array.isArray(meals) ? meals : []) {
    if (!meal?.id) continue;
    if (meal.hidden) hidden.push(meal.id);
    if (meal.seed || SEED_IDS.has(meal.id)) {
      seedEdits[meal.id] = {
        name: meal.name,
        types: meal.types,
        notes: meal.notes || "",
        recipeUrl: meal.recipeUrl || "",
        ingredients: normalizeIngredients(meal.ingredients),
        makeAhead: Boolean(meal.makeAhead),
      };
    } else {
      userMeals.push(meal);
    }
  }
  replaceUserMeals(userMeals);
  replaceSeedEdits(seedEdits);
  replaceHiddenSeedIds(hidden);
}

export function applyRemotePlan(weekdays) {
  if (!weekdays || typeof weekdays !== "object") return loadPlan();
  const plan = normalizeV5({ weekdays });
  write(KEYS.plan, { version: 5, weekdays: plan.weekdays });
  return plan;
}

export function applyRemoteGrocery(stores) {
  const grocery = {
    stores: (Array.isArray(stores) ? stores : []).map(normalizeGroceryStore).filter(Boolean),
  };
  saveGrocery(grocery);
  return grocery;
}

export function exportSyncMeals() {
  return loadMeals();
}

export function exportHiddenSeedIds() {
  return read(KEYS.hidden, []);
}
