import { DAYS, SEED_MEALS, SEED_PLAN, SLOTS, emptySlots, normalizeIngredients, rollingDays, storeKey } from "./data.js";

const KEYS = {
  userMeals: "fm.userMeals",
  seedEdits: "fm.seedEdits",
  hidden: "fm.hiddenSeedIds",
  plan: "fm.weeklyPlan",
  grocery: "fm.grocery",
};

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

export function loadPlan(now = new Date()) {
  const saved = read(KEYS.plan, null);
  const dates = {};

  if (saved?.version === 3 && saved.dates && typeof saved.dates === "object") {
    for (const [key, value] of Object.entries(saved.dates)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) dates[key] = dayFromSaved(value);
    }
  } else if (isOldWeekdayPlan(saved)) {
    for (const day of rollingDays(now)) {
      if (day.seedable && saved[day.weekdayId]) {
        dates[day.key] = dayFromSaved(saved[day.weekdayId]);
      }
    }
    write(KEYS.plan, { version: 3, dates });
  }

  return { dates };
}

export function resolveDayPlan(plan, day) {
  if (plan.dates[day.key]) return plan.dates[day.key];
  if (day.seedable) return clone(SEED_PLAN[day.weekdayId]);
  return emptySlots();
}

export function slotHasMeal(slot) {
  if (!slot || typeof slot !== "object") return false;
  return Boolean(slot.mealId || (typeof slot.label === "string" && slot.label.trim()));
}

export function dayHasMeals(plan, day) {
  const slots = resolveDayPlan(plan, day);
  return SLOTS.some((slot) => slotHasMeal(slots[slot.id]));
}

export function clearDayPlan(plan, day) {
  plan.dates[day.key] = emptySlots();
  return plan.dates[day.key];
}

export function ensureDayPlan(plan, day) {
  if (!plan.dates[day.key]) {
    plan.dates[day.key] = day.seedable ? clone(SEED_PLAN[day.weekdayId]) : emptySlots();
  }
  return plan.dates[day.key];
}

export function swapDaySlots(plan, fromDay, toDay, slotId) {
  if (!fromDay || !toDay || fromDay.key === toDay.key) return plan;
  if (!SLOTS.some((slot) => slot.id === slotId)) return plan;
  const from = ensureDayPlan(plan, fromDay);
  const to = ensureDayPlan(plan, toDay);
  const held = clone(from[slotId]);
  from[slotId] = clone(to[slotId]);
  to[slotId] = held;
  return plan;
}

export function savePlan(plan) {
  write(KEYS.plan, { version: 3, dates: plan.dates });
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
