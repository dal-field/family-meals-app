import { SEED_MEALS, SEED_MIDWEEK, SEED_PLAN, DAYS, SLOTS } from "./data.js";

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

export function loadPlan() {
  const saved = read(KEYS.plan, null);
  const plan = clone(SEED_PLAN);
  if (!saved || typeof saved !== "object") return plan;

  for (const day of DAYS) {
    const savedDay = saved[day.id];
    if (!savedDay) continue;
    for (const slot of SLOTS) {
      const savedSlot = savedDay[slot.id];
      if (savedSlot && typeof savedSlot === "object") {
        plan[day.id][slot.id] = {
          mealId: savedSlot.mealId ?? null,
          label: typeof savedSlot.label === "string" ? savedSlot.label : "",
        };
      }
    }
  }
  return plan;
}

export function savePlan(plan) {
  write(KEYS.plan, plan);
}

export function loadGrocery() {
  const saved = read(KEYS.grocery, null);
  const midweek = SEED_MIDWEEK.map((item) => ({
    ...item,
    checked: Boolean(saved?.midweek?.[item.id]),
    seed: true,
  }));
  const extras = Array.isArray(saved?.extras)
    ? saved.extras
        .filter((item) => item && item.id && item.name)
        .map((item) => ({
          id: item.id,
          name: item.name,
          checked: Boolean(item.checked),
          seed: false,
        }))
    : [];
  return { midweek, extras };
}

export function saveGrocery(grocery) {
  write(KEYS.grocery, {
    midweek: Object.fromEntries(grocery.midweek.map((item) => [item.id, item.checked])),
    extras: grocery.extras,
  });
}
