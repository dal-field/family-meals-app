import { DAYS, SEED_MEALS, SEED_PLAN, SLOTS, emptySlots, rollingDays } from "./data.js";

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

export function loadMeals() {
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
    };
  });

  const extras = userMeals
    .filter((meal) => meal && meal.id && !SEED_MEALS.some((seed) => seed.id === meal.id))
    .map((meal) => ({ ...meal, seed: false, hidden: Boolean(meal.hidden) }));

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
    ingredients: meal.ingredients || "",
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
    ingredients: meal.ingredients || "",
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

export function savePlan(plan) {
  write(KEYS.plan, { version: 3, dates: plan.dates });
}

function normalizeGroceryItem(item) {
  if (!item || !item.id || !item.name) return null;
  return {
    id: String(item.id),
    name: String(item.name),
    checked: Boolean(item.checked),
    store: typeof item.store === "string" ? item.store.trim() : "",
  };
}

export function loadGrocery() {
  const saved = read(KEYS.grocery, null);
  if (saved?.version === 2 && Array.isArray(saved.items)) {
    return {
      items: saved.items.map(normalizeGroceryItem).filter(Boolean),
      customStores: Array.isArray(saved.customStores)
        ? saved.customStores.filter((name) => typeof name === "string" && name.trim())
        : [],
    };
  }

  const extras = Array.isArray(saved?.extras) ? saved.extras : [];
  return {
    items: extras.map(normalizeGroceryItem).filter(Boolean),
    customStores: [],
  };
}

export function saveGrocery(grocery) {
  write(KEYS.grocery, {
    version: 2,
    items: grocery.items,
    customStores: grocery.customStores || [],
  });
}
