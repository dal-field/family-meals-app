const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const DEFAULT_FAMILY_NAME = "Family Name";
export const MAX_FAMILY_NAME = 40;

export function normalizeFamilyName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FAMILY_NAME);
}

export function displayFamilyName(value) {
  return normalizeFamilyName(value) || DEFAULT_FAMILY_NAME;
}

export function generateFamilyCode(randomBytes) {
  const bytes =
    randomBytes ||
    (typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(6))
      : Array.from({ length: 6 }, () => Math.floor(Math.random() * 256)));
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

export function normalizeFamilyCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function isFamilyCode(value) {
  return /^[A-Z0-9]{6}$/.test(String(value || ""));
}

export function mealIsUserCreated(meal) {
  if (!meal?.id) return false;
  if (String(meal.id).startsWith("user-")) return true;
  return meal.seed === false;
}

export function mergeLocalOnlyMeals(remoteMeals, localMeals) {
  const remote = Array.isArray(remoteMeals) ? remoteMeals.filter((meal) => meal?.id) : [];
  const remoteIds = new Set(remote.map((meal) => meal.id));
  const extras = (Array.isArray(localMeals) ? localMeals : []).filter(
    (meal) => mealIsUserCreated(meal) && !remoteIds.has(meal.id)
  );
  return [...remote, ...extras];
}

export function mealsForUpload(meals, hiddenIds = []) {
  const hidden = new Set(hiddenIds);
  return (Array.isArray(meals) ? meals : [])
    .filter((meal) => meal?.id)
    .map((meal) => ({
      id: meal.id,
      name: meal.name || "",
      types: Array.isArray(meal.types) ? meal.types : [],
      notes: meal.notes || "",
      recipeUrl: meal.recipeUrl || "",
      ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
      makeAhead: Boolean(meal.makeAhead),
      seed: Boolean(meal.seed),
      hidden: hidden.has(meal.id) || Boolean(meal.hidden),
    }));
}
