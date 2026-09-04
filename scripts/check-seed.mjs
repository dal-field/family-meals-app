import { SEED_MEALS, SEED_PLAN, SEED_MIDWEEK, DAYS, SLOTS, emptySlot, normalizeIngredients, weekTemplateDays } from "../src/data.js";
import { DEFAULT_FAMILY_NAME, displayFamilyName, generateFamilyCode, isFamilyCode, mealsForUpload, mergeLocalOnlyMeals, normalizeFamilyCode, normalizeFamilyName } from "../src/family.js";
import { MAX_PHOTO_DATA_URL, resolvedMealPhotoSrc, scaleSize } from "../src/photos.js";
import { applyRemoteMeals, clearDayPlan, clearImprovisedSeedNotes, dayHasMeals, freshPlan, loadFamilyCode, loadFamilyName, loadMeals, migrateLegacyGrocery, migratePlanToV5, resolveDayPlan, saveFamilyCode, saveFamilyName, saveSeedEdit, setPlanSlot, slotHasMeal, swapDaySlots } from "../src/storage.js";

const names = new Set(SEED_MEALS.map((meal) => meal.name.toLowerCase()));
const required = [
  "2 boiled eggs, toast",
  "Ham sandwich",
  "Spaghetti",
  "Apples and pb",
  "Burritos",
  "Banana sandwich",
  "Cottage cheese, crackers",
  "Sandwiches",
  "Tuna sandwich",
  "Lettuce wraps, pot stickers, peas",
  "Ants on a log",
  "Protein Pancakes",
  "Turkey, cheese roll up",
  "Chicken green bean casserole",
  "Protein shake",
  "Scrambled eggs, bacon",
  "Pb, honey sandwich",
  "Beef stroganoff",
  "Bananas, pb, cheese stick",
  "Crepes",
  "Hot dogs",
  "Bbq pork sandwiches",
  "Eggs, cereal",
  "Egg salad sandwich",
  "Chicken pillows",
  "Boiled eggs, smoothies",
  "White ck chili",
  "Enchiladas",
  "Tacos",
  "Shrimp",
  "Fried Rice",
  "Meatloaf",
  "Chicken",
  "Breakfast casserole",
  "Ham sliders",
  "Savory crepes",
  "Chicken thighs (Costco)",
  "Chili Mac",
  "Ranch sheet chicken breasts",
  "Baked roast w ranch",
  "Chicken sandwiches w panko chicken",
  "Sheet pan chicken",
  "Lisa tostadas",
  "Hawaiian haystacks",
  "Roast",
  "Taco bowls",
  "Curry chicken (Costco)",
  "Florentine Ck (Costco)",
  "Tilapia",
  "Hamburgers",
  "Taquitos",
  "Meatballs and sauce",
  "Chicken Alfredo",
  "Tater tot casserole",
  "Hamburger sliders",
  "Beach club sandwiches",
  "Shrimp linguine",
  "Pork tacos",
];

const missing = required.filter((name) => !names.has(name.toLowerCase()));
if (missing.length) {
  console.error("Missing meals:", missing);
  process.exit(1);
}

const makeAhead = SEED_MEALS.filter((meal) => meal.makeAhead).map((meal) => meal.name);
const expectAhead = ["Burritos", "Sandwiches", "Boiled eggs, smoothies", "Crepes"];
for (const name of expectAhead) {
  if (!makeAhead.includes(name)) {
    console.error("Missing make-ahead:", name);
    process.exit(1);
  }
}

for (const day of DAYS) {
  for (const slot of SLOTS) {
    const cell = SEED_PLAN[day.id][slot.id];
    if (cell.mealId && !SEED_MEALS.some((meal) => meal.id === cell.mealId)) {
      console.error("Plan points at missing meal", day.id, slot.id, cell.mealId);
      process.exit(1);
    }
  }
}

const taquitos = SEED_MEALS.find((meal) => meal.id === "taquitos");
const alfredo = SEED_MEALS.find((meal) => meal.id === "chicken-alfredo");
if (!taquitos?.recipeUrl.includes("ourbestbites.com")) {
  console.error("Taquitos URL missing");
  process.exit(1);
}
if (!alfredo?.recipeUrl.includes("valentinascorner.com")) {
  console.error("Alfredo URL missing");
  process.exit(1);
}

if (SEED_MIDWEEK.map((item) => item.name).join("|") !== "Salad kit|Chicken (Th, Sun)|Cantaloupe") {
  console.error("Midweek list mismatch");
  process.exit(1);
}

if (new Set(SEED_MEALS.map((meal) => meal.id)).size !== SEED_MEALS.length) {
  console.error("Duplicate meal ids");
  process.exit(1);
}

const thursday = new Date("2026-09-03T12:00:00");
const days = weekTemplateDays(thursday);
const dayByWeekday = (list, id) => list.find((day) => day.weekdayId === id);
if (days.map((day) => day.compact).join(",") !== "M,Tu,W,Th,F,Sa,Su") {
  console.error("Week must be Monday–Sunday top to bottom", days.map((day) => day.compact));
  process.exit(1);
}
if (days.map((day) => day.title).join("|") !== "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday") {
  console.error("Weekday titles must not include calendar dates", days.map((day) => day.title));
  process.exit(1);
}
if (days.some((day) => day.dateLabel || /\d/.test(day.title))) {
  console.error("Template days must not carry dates", days);
  process.exit(1);
}
if (!dayByWeekday(days, "thursday").isToday || dayByWeekday(days, "monday").isToday) {
  console.error("Today highlight must stay on Thursday, not the first row");
  process.exit(1);
}

if (DAYS.map((day) => day.compact).join(",") !== "M,Tu,W,Th,F,Sa,Su") {
  console.error("Compact weekday labels must stay unambiguous", DAYS.map((day) => day.compact));
  process.exit(1);
}

const thisThursday = dayByWeekday(days, "thursday");
const thisFriday = dayByWeekday(days, "friday");
const thisMonday = dayByWeekday(days, "monday");

const plan = freshPlan();
const thursdayPlan = resolveDayPlan(plan, thisThursday);
if (thursdayPlan.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Thursday should use the seed dinner");
  process.exit(1);
}
if (thursdayPlan.breakfast.mealId !== "protein-pancakes") {
  console.error("Thursday breakfast should come from the weekday template");
  process.exit(1);
}

const thisMondayPlan = resolveDayPlan(plan, thisMonday);
if (thisMondayPlan.breakfast.mealId !== "boiled-eggs-toast") {
  console.error("Monday should keep recurring breakfast", thisMondayPlan.breakfast);
  process.exit(1);
}
if (thisMondayPlan.dinner.mealId !== "spaghetti") {
  console.error("Monday dinner should stay on the repeating template", thisMondayPlan.dinner);
  process.exit(1);
}

if (!dayHasMeals(plan, thisThursday) || !dayHasMeals(plan, thisMonday)) {
  console.error("Seeded weekdays should report meals");
  process.exit(1);
}

const writable = freshPlan();
clearDayPlan(writable, thisThursday);
if (dayHasMeals(writable, thisThursday)) {
  console.error("Cleared Thursday should not still report meals");
  process.exit(1);
}
const clearedThursday = resolveDayPlan(writable, thisThursday);
if (clearedThursday.breakfast.mealId || clearedThursday.dinner.label) {
  console.error("Cleared Thursday should stay empty and not re-seed", clearedThursday);
  process.exit(1);
}
if (writable.weekdays.thursday.dinner.mealId || writable.weekdays.thursday.breakfast.mealId) {
  console.error("Clear must persist the empty Thursday template", writable.weekdays.thursday);
  process.exit(1);
}
if (writable.weekdays.friday.dinner.mealId !== "beef-stroganoff") {
  console.error("Clear must not touch Friday dinner", writable.weekdays.friday);
  process.exit(1);
}
if (writable.weekdays.friday.breakfast.mealId !== "scrambled-eggs-bacon") {
  console.error("Clear must not wipe other weekday templates", writable.weekdays.friday);
  process.exit(1);
}

const edited = freshPlan();
setPlanSlot(edited, thisThursday, "breakfast", emptySlot());
if (slotHasMeal(resolveDayPlan(edited, thisThursday).breakfast)) {
  console.error("User-cleared Thursday breakfast must stay empty");
  process.exit(1);
}
if (resolveDayPlan(edited, thisThursday).dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Clearing breakfast must not wipe Thursday dinner");
  process.exit(1);
}

const splitLines = normalizeIngredients("Tortillas\nCheese\n\nSalsa");
if (splitLines.join("|") !== "Tortillas|Cheese|Salsa") {
  console.error("Newline ingredients should become separate items", splitLines);
  process.exit(1);
}
if (normalizeIngredients([" Milk ", "", "Eggs"]).join("|") !== "Milk|Eggs") {
  console.error("Array ingredients should trim empties");
  process.exit(1);
}
if (normalizeIngredients(null).length) {
  console.error("Missing ingredients should be an empty list");
  process.exit(1);
}

const swapped = freshPlan();
swapDaySlots(swapped, thisThursday, thisFriday, "dinner");
const thuAfterSwap = resolveDayPlan(swapped, thisThursday);
const friAfterSwap = resolveDayPlan(swapped, thisFriday);
if (thuAfterSwap.dinner.mealId !== "beef-stroganoff" || friAfterSwap.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Thursday and Friday dinners should swap", thuAfterSwap.dinner, friAfterSwap.dinner);
  process.exit(1);
}
if (thuAfterSwap.breakfast.mealId !== "protein-pancakes" || friAfterSwap.breakfast.mealId !== "scrambled-eggs-bacon") {
  console.error("Dinner swap must not move other meal types");
  process.exit(1);
}

const moved = freshPlan();
swapDaySlots(moved, thisThursday, thisMonday, "lunch");
const thuAfterMove = resolveDayPlan(moved, thisThursday);
const monAfterMove = resolveDayPlan(moved, thisMonday);
if (thuAfterMove.lunch.mealId !== "ham-sandwich") {
  console.error("Lunch swap should exchange weekday templates", thuAfterMove.lunch);
  process.exit(1);
}
if (monAfterMove.lunch.mealId !== "turkey-cheese-roll-up") {
  console.error("Monday lunch should receive Thursday's recurring lunch", monAfterMove.lunch);
  process.exit(1);
}
if (thuAfterMove.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Moving lunch should not re-seed or clear Thursday dinner");
  process.exit(1);
}

const migrated = migratePlanToV5(
  {
    version: 3,
    dates: {
      "2026-09-03": {
        breakfast: { mealId: "crepes", label: "Crepes" },
        lunch: { mealId: "turkey-cheese-roll-up", label: "Turkey, cheese roll up" },
        dinner: { mealId: "tacos", label: "Tacos" },
        snack: { mealId: "protein-shake", label: "Protein shake" },
      },
    },
  },
  thursday
);
if (migrated.weekdays.thursday.breakfast.mealId !== "crepes") {
  console.error("v3 Thursday breakfast should become the recurring template", migrated.weekdays.thursday);
  process.exit(1);
}
if (migrated.weekdays.friday.breakfast.mealId !== "scrambled-eggs-bacon") {
  console.error("Unedited weekdays should keep the seed template", migrated.weekdays.friday);
  process.exit(1);
}
if (migrated.weekdays.thursday.dinner.mealId !== "tacos") {
  console.error("Visible-week Thursday dinner should become the weekday dinner", migrated.weekdays.thursday);
  process.exit(1);
}
if (migrated.weekdays.friday.dinner.mealId !== "beef-stroganoff") {
  console.error("Current-week dinners missing from v3 should keep the seed", migrated.weekdays.friday);
  process.exit(1);
}
if (migrated.dinners) {
  console.error("v5 plans must not keep date-keyed dinners", migrated);
  process.exit(1);
}

const migratedFutureEmpty = migratePlanToV5(
  {
    version: 3,
    dates: {
      "2026-09-07": {
        breakfast: { mealId: null, label: "" },
        lunch: { mealId: "turkey-cheese-roll-up", label: "Turkey, cheese roll up" },
        dinner: { mealId: null, label: "" },
        snack: { mealId: null, label: "" },
      },
    },
  },
  thursday
);
if (migratedFutureEmpty.weekdays.monday.breakfast.mealId !== "boiled-eggs-toast") {
  console.error("Empty next-week Monday must not wipe the seed breakfast template", migratedFutureEmpty.weekdays.monday);
  process.exit(1);
}
if (migratedFutureEmpty.weekdays.monday.lunch.mealId !== "turkey-cheese-roll-up") {
  console.error("Filled next-week Monday lunch should become the recurring template", migratedFutureEmpty.weekdays.monday);
  process.exit(1);
}

const migratedClear = migratePlanToV5(
  {
    version: 3,
    dates: {
      "2026-09-03": {
        breakfast: { mealId: "protein-pancakes", label: "Protein Pancakes" },
        lunch: { mealId: "turkey-cheese-roll-up", label: "Turkey, cheese roll up" },
        dinner: { mealId: null, label: "" },
        snack: { mealId: "protein-shake", label: "Protein shake" },
      },
    },
  },
  thursday
);
if (slotHasMeal(migratedClear.weekdays.thursday.dinner)) {
  console.error("User-cleared visible-week dinner must stay empty after migration", migratedClear.weekdays.thursday);
  process.exit(1);
}

const alreadyV4 = migratePlanToV5(
  {
    version: 4,
    weekdays: {
      thursday: {
        breakfast: { mealId: null, label: "" },
        lunch: { mealId: "ham-sandwich", label: "Ham sandwich" },
        snack: { mealId: null, label: "" },
      },
    },
    dinners: {
      "2026-08-27": { mealId: "tacos", label: "Tacos" },
      "2026-09-03": { mealId: "enchiladas", label: "Enchiladas" },
    },
  },
  thursday
);
if (slotHasMeal(alreadyV4.weekdays.thursday.breakfast)) {
  console.error("Existing v4 empty weekday breakfast must not re-seed", alreadyV4.weekdays.thursday);
  process.exit(1);
}
if (alreadyV4.weekdays.thursday.lunch.mealId !== "ham-sandwich") {
  console.error("Existing v4 weekday lunch should be preserved", alreadyV4.weekdays.thursday);
  process.exit(1);
}
if (alreadyV4.weekdays.thursday.dinner.mealId !== "enchiladas") {
  console.error("Visible-week dinner should win over an older Thursday dinner", alreadyV4.weekdays.thursday);
  process.exit(1);
}

const olderDinnerOnly = migratePlanToV5(
  {
    version: 4,
    weekdays: {
      monday: {
        breakfast: { mealId: "boiled-eggs-toast", label: "2 boiled eggs, toast" },
        lunch: { mealId: "ham-sandwich", label: "Ham sandwich" },
        snack: { mealId: "apples-and-pb", label: "Apples and pb" },
      },
    },
    dinners: {
      "2026-08-24": { mealId: "tacos", label: "Tacos" },
    },
  },
  thursday
);
if (olderDinnerOnly.weekdays.monday.dinner.mealId !== "tacos") {
  console.error("When the visible week has no Monday dinner, use the most recent Monday dinner", olderDinnerOnly.weekdays.monday);
  process.exit(1);
}

const groceryMigrated = migrateLegacyGrocery({
  version: 2,
  items: [
    { id: "g1", name: "Milk", checked: false, store: "" },
    { id: "g2", name: "Chicken", checked: true, store: "Costco" },
    { id: "g3", name: "Chips", checked: false, store: "Aldi" },
  ],
  customStores: ["Trader Joe's"],
});
const migratedNames = groceryMigrated.stores.map((store) => store.name).sort().join("|");
if (migratedNames !== "Aldi|Costco|No store|Trader Joe's") {
  console.error("Legacy grocery tags should become store sections", groceryMigrated.stores);
  process.exit(1);
}
const costco = groceryMigrated.stores.find((store) => store.name === "Costco");
if (!costco || costco.items.length !== 1 || costco.items[0].name !== "Chicken") {
  console.error("Legacy items should land in their tagged store", costco);
  process.exit(1);
}
const emptyStore = groceryMigrated.stores.find((store) => store.name === "Trader Joe's");
if (!emptyStore || emptyStore.items.length) {
  console.error("Custom stores without items should stay visible", emptyStore);
  process.exit(1);
}

const scaledDown = scaleSize(4000, 3000, 1600);
if (scaledDown.width !== 1600 || scaledDown.height !== 1200) {
  console.error("Wide photos should scale to the max edge", scaledDown);
  process.exit(1);
}
const scaledTall = scaleSize(800, 2400, 1600);
if (scaledTall.width !== 533 || scaledTall.height !== 1600) {
  console.error("Tall photos should scale to the max edge", scaledTall);
  process.exit(1);
}
const alreadySmall = scaleSize(800, 600, 1600);
if (alreadySmall.width !== 800 || alreadySmall.height !== 600) {
  console.error("Small photos should not be upscaled", alreadySmall);
  process.exit(1);
}

if (resolvedMealPhotoSrc(undefined) || resolvedMealPhotoSrc("none") || resolvedMealPhotoSrc({})) {
  console.error("Missing meal photos must not produce a src");
  process.exit(1);
}
if (resolvedMealPhotoSrc({ url: "blob:full", thumbUrl: "blob:thumb" }) !== "blob:thumb") {
  console.error("Cached meal photos should prefer the thumbnail src");
  process.exit(1);
}
if (resolvedMealPhotoSrc({ url: "blob:full" }) !== "blob:full") {
  console.error("Cached meal photos should fall back to the full src");
  process.exit(1);
}

const seededWithNotes = SEED_MEALS.filter((meal) => meal.notes);
if (seededWithNotes.length) {
  console.error("Seed meals must not carry invented notes", seededWithNotes.map((meal) => meal.id));
  process.exit(1);
}
if (SEED_PLAN.monday.dinner.label !== "Spaghetti, toast, peas") {
  console.error("Weekly-plan dinner labels with sides must stay", SEED_PLAN.monday.dinner);
  process.exit(1);
}
if (SEED_PLAN.tuesday.dinner.label !== "Burritos, rice, corn") {
  console.error("Tuesday dinner label must keep rice and corn", SEED_PLAN.tuesday.dinner);
  process.exit(1);
}
if (!SEED_MEALS.find((meal) => meal.id === "burritos")?.makeAhead) {
  console.error("Burritos must stay make-ahead");
  process.exit(1);
}

const migratedNotes = clearImprovisedSeedNotes({
  seedEdits: {
    burritos: { notes: "Works for breakfast or dinner. Make ahead. Tuesday dinner is often served with rice and corn." },
    taquitos: { notes: "Baked creamy chicken taquitos.", recipeUrl: "https://ourbestbites.com/baked-creamy-chicken-taquitos/" },
  },
  userMeals: [
    { id: "user-leftover-soup", seed: false, notes: "Parent-typed leftover note" },
    { id: "mystery-seed", seed: true, notes: "Invented seed copy" },
  ],
});
if (migratedNotes.seedEdits.burritos.notes || migratedNotes.seedEdits.taquitos.notes) {
  console.error("Seed edits must drop invented notes", migratedNotes.seedEdits);
  process.exit(1);
}
if (!migratedNotes.seedEdits.taquitos.recipeUrl.includes("ourbestbites.com")) {
  console.error("Clearing seed notes must keep recipe URLs", migratedNotes.seedEdits.taquitos);
  process.exit(1);
}
if (migratedNotes.userMeals[0].notes !== "Parent-typed leftover note") {
  console.error("User-created meal notes must stay", migratedNotes.userMeals[0]);
  process.exit(1);
}
if (migratedNotes.userMeals[1].notes) {
  console.error("seed:true records must lose invented notes", migratedNotes.userMeals[1]);
  process.exit(1);
}

const memory = new Map();
globalThis.localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  },
  removeItem(key) {
    memory.delete(key);
  },
};
memory.set(
  "fm.seedEdits",
  JSON.stringify({
    burritos: { notes: "Works for breakfast or dinner. Make ahead. Tuesday dinner is often served with rice and corn." },
  })
);
memory.set(
  "fm.userMeals",
  JSON.stringify([
    { id: "user-leftover-soup", name: "Leftover soup", types: ["dinner"], notes: "Parent-typed leftover note", seed: false, ingredients: [] },
  ])
);

const firstLoad = loadMeals();
if (firstLoad.find((meal) => meal.id === "burritos")?.notes) {
  console.error("First load should wipe invented seed notes from fm.seedEdits");
  process.exit(1);
}
if (firstLoad.find((meal) => meal.id === "user-leftover-soup")?.notes !== "Parent-typed leftover note") {
  console.error("First load must keep user-created notes");
  process.exit(1);
}

saveSeedEdit({
  id: "burritos",
  name: "Burritos",
  types: ["breakfast", "dinner"],
  notes: "Parent typed this later",
  recipeUrl: "",
  ingredients: [],
  makeAhead: true,
});
const secondLoad = loadMeals();
if (secondLoad.find((meal) => meal.id === "burritos")?.notes !== "Parent typed this later") {
  console.error("After the one-time migration, later seed edits must keep parent notes");
  process.exit(1);
}

const generated = generateFamilyCode(Uint8Array.from([0, 1, 35, 36, 10, 255]));
if (!isFamilyCode(generated) || generated.length !== 6) {
  console.error("Family codes must be 6 A–Z0–9 characters", generated);
  process.exit(1);
}
if (normalizeFamilyCode("ab-c12z!") !== "ABC12Z") {
  console.error("Family codes should strip and uppercase", normalizeFamilyCode("ab-c12z!"));
  process.exit(1);
}
if (normalizeFamilyCode("abcdefgh") !== "ABCDEF") {
  console.error("Family codes should stay 6 characters", normalizeFamilyCode("abcdefgh"));
  process.exit(1);
}
if (isFamilyCode("abc123") || isFamilyCode("ABC12") || !isFamilyCode("ABC123")) {
  console.error("Family code validation should require exactly 6 uppercase A–Z0–9");
  process.exit(1);
}

const remoteMeals = [
  { id: "spaghetti", seed: true, name: "Spaghetti" },
  { id: "user-jess-soup", seed: false, name: "Jess soup" },
];
const localMeals = [
  { id: "spaghetti", seed: true, name: "Spaghetti local" },
  { id: "user-dallin-chili", seed: false, name: "Dallin chili" },
  { id: "burritos", seed: true, name: "Burritos" },
];
const merged = mergeLocalOnlyMeals(remoteMeals, localMeals);
if (!merged.find((meal) => meal.id === "spaghetti" && meal.name === "Spaghetti")) {
  console.error("Join should keep the remote household meals", merged);
  process.exit(1);
}
if (!merged.find((meal) => meal.id === "user-jess-soup") || !merged.find((meal) => meal.id === "user-dallin-chili")) {
  console.error("Join should keep both phones' user-created meals", merged);
  process.exit(1);
}
if (merged.some((meal) => meal.id === "burritos")) {
  console.error("Join should not invent seed meals that the remote household omitted", merged);
  process.exit(1);
}

const uploaded = mealsForUpload(
  [{ id: "burritos", name: "Burritos", types: ["dinner"], notes: "", hidden: false, seed: true, ingredients: [] }],
  ["burritos"]
);
if (!uploaded[0].hidden) {
  console.error("Hidden seed meals must upload as hidden", uploaded[0]);
  process.exit(1);
}

if (MAX_PHOTO_DATA_URL !== 700 * 1024) {
  console.error("Meal photos must stay under the Firestore document budget", MAX_PHOTO_DATA_URL);
  process.exit(1);
}
const syncSize = scaleSize(4000, 3000, 1200);
if (syncSize.width !== 1200 || syncSize.height !== 900) {
  console.error("Sync photos should downscale to about 1200px", syncSize);
  process.exit(1);
}

saveFamilyCode("ab12cd");
if (loadFamilyCode() !== "AB12CD") {
  console.error("Saved family codes should normalize to A–Z0–9", loadFamilyCode());
  process.exit(1);
}

applyRemoteMeals([
  {
    id: "user-jess-soup",
    name: "Jess soup",
    types: ["dinner"],
    notes: "hers",
    seed: false,
    ingredients: ["broth"],
  },
  {
    id: "burritos",
    name: "Burritos",
    types: ["breakfast", "dinner"],
    notes: "shared note",
    seed: true,
    hidden: true,
    ingredients: [],
    makeAhead: true,
  },
]);
const afterRemote = loadMeals();
if (afterRemote.find((meal) => meal.id === "user-jess-soup")?.notes !== "hers") {
  console.error("Remote user meals should land in the local library", afterRemote.find((meal) => meal.id === "user-jess-soup"));
  process.exit(1);
}
if (afterRemote.find((meal) => meal.id === "burritos")?.notes !== "shared note") {
  console.error("Remote seed edits should apply without wiping user notes", afterRemote.find((meal) => meal.id === "burritos"));
  process.exit(1);
}
if (!afterRemote.find((meal) => meal.id === "burritos")?.hidden) {
  console.error("Remote hidden flags should apply to seed meals");
  process.exit(1);
}

if (DEFAULT_FAMILY_NAME !== "Family Name") {
  console.error("Unset family title must be exactly Family Name", DEFAULT_FAMILY_NAME);
  process.exit(1);
}
if (displayFamilyName("") !== "Family Name" || displayFamilyName("   ") !== "Family Name") {
  console.error("Empty family names should display as Family Name");
  process.exit(1);
}
if (normalizeFamilyName("  Littlefields  ") !== "Littlefields") {
  console.error("Family names should trim", normalizeFamilyName("  Littlefields  "));
  process.exit(1);
}
if (normalizeFamilyName("A".repeat(50)).length !== 40) {
  console.error("Family names should cap at 40 characters");
  process.exit(1);
}
if (displayFamilyName("The Littlefields") !== "The Littlefields") {
  console.error("Saved family names should display as typed");
  process.exit(1);
}

saveFamilyName("  Jessica & Dallin  ");
if (loadFamilyName() !== "Jessica & Dallin") {
  console.error("Saved family names should persist trimmed", loadFamilyName());
  process.exit(1);
}
saveFamilyName("");
if (loadFamilyName() || displayFamilyName(loadFamilyName()) !== "Family Name") {
  console.error("Clearing the family name should fall back to Family Name");
  process.exit(1);
}

console.log(`OK: ${SEED_MEALS.length} seed meals, 7-day plan, ${SEED_MIDWEEK.length} midweek items`);
