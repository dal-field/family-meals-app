import { SEED_MEALS, SEED_PLAN, SEED_MIDWEEK, DAYS, SLOTS, daysStartingToday, normalizeIngredients, rollingDays } from "../src/data.js";
import { clearDayPlan, dayHasMeals, migrateLegacyGrocery, resolveDayPlan, swapDaySlots } from "../src/storage.js";

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
const rotated = daysStartingToday(thursday).map((day) => day.id);
if (rotated.join(",") !== "thursday,friday,saturday,sunday,monday,tuesday,wednesday") {
  console.error("Week rotation mismatch", rotated);
  process.exit(1);
}

const rolling = rollingDays(thursday);
if (rolling.map((day) => day.title).join("|") !== "Thursday (9/3)|Friday (9/4)|Saturday (9/5)|Sunday (9/6)|Monday (9/7)|Tuesday (9/8)|Wednesday (9/9)") {
  console.error("Rolling titles mismatch", rolling.map((day) => day.title));
  process.exit(1);
}
if (rolling.filter((day) => day.seedable).map((day) => day.key).join(",") !== "2026-09-03,2026-09-04,2026-09-05,2026-09-06") {
  console.error("Seedable dates mismatch", rolling);
  process.exit(1);
}

const emptyPlan = { dates: {} };
const thursdayPlan = resolveDayPlan(emptyPlan, rolling[0]);
if (thursdayPlan.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Current-week Thursday should use seed dinner");
  process.exit(1);
}
const nextMonday = resolveDayPlan(emptyPlan, rolling[4]);
if (nextMonday.breakfast.label || nextMonday.dinner.label) {
  console.error("Next Monday should start empty", nextMonday);
  process.exit(1);
}

const writable = { dates: {} };
if (!dayHasMeals(writable, rolling[0])) {
  console.error("Seeded Thursday should report meals");
  process.exit(1);
}
if (dayHasMeals(writable, rolling[4])) {
  console.error("Empty next Monday should not report meals");
  process.exit(1);
}

clearDayPlan(writable, rolling[0]);
if (dayHasMeals(writable, rolling[0])) {
  console.error("Cleared Thursday should not still report meals");
  process.exit(1);
}
const clearedThursday = resolveDayPlan(writable, rolling[0]);
if (clearedThursday.breakfast.mealId || clearedThursday.dinner.label) {
  console.error("Cleared Thursday should stay empty and not re-seed", clearedThursday);
  process.exit(1);
}
if (!writable.dates["2026-09-03"]) {
  console.error("Clear must persist empty slots on the concrete date");
  process.exit(1);
}
if (writable.dates["2026-09-04"] || writable.dates["2026-09-07"]) {
  console.error("Clear must not touch other dates", writable.dates);
  process.exit(1);
}
const fridayAfterClear = resolveDayPlan(writable, rolling[1]);
if (fridayAfterClear.dinner.mealId !== "beef-stroganoff") {
  console.error("Friday should still use seed dinner after Thursday clear");
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

const swapped = { dates: {} };
swapDaySlots(swapped, rolling[0], rolling[1], "dinner");
const thuAfterSwap = resolveDayPlan(swapped, rolling[0]);
const friAfterSwap = resolveDayPlan(swapped, rolling[1]);
if (thuAfterSwap.dinner.mealId !== "beef-stroganoff" || friAfterSwap.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Thursday and Friday dinners should swap", thuAfterSwap.dinner, friAfterSwap.dinner);
  process.exit(1);
}
if (thuAfterSwap.breakfast.mealId !== "protein-pancakes" || friAfterSwap.breakfast.mealId !== "scrambled-eggs-bacon") {
  console.error("Swap must not move other meal types");
  process.exit(1);
}

const moved = { dates: {} };
swapDaySlots(moved, rolling[0], rolling[4], "lunch");
const thuAfterMove = resolveDayPlan(moved, rolling[0]);
const monAfterMove = resolveDayPlan(moved, rolling[4]);
if (thuAfterMove.lunch.mealId || thuAfterMove.lunch.label) {
  console.error("Filled-to-empty swap should leave Thursday lunch empty", thuAfterMove.lunch);
  process.exit(1);
}
if (monAfterMove.lunch.mealId !== "turkey-cheese-roll-up") {
  console.error("Thursday lunch should move onto next Monday", monAfterMove.lunch);
  process.exit(1);
}
if (thuAfterMove.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Moving lunch should not re-seed or clear Thursday dinner");
  process.exit(1);
}
if (moved.dates["2026-09-05"] || moved.dates["2026-09-06"]) {
  console.error("Swap must only persist the two dates", Object.keys(moved.dates));
  process.exit(1);
}

const migrated = migrateLegacyGrocery({
  version: 2,
  items: [
    { id: "g1", name: "Milk", checked: false, store: "" },
    { id: "g2", name: "Chicken", checked: true, store: "Costco" },
    { id: "g3", name: "Chips", checked: false, store: "Aldi" },
  ],
  customStores: ["Trader Joe's"],
});
const migratedNames = migrated.stores.map((store) => store.name).sort().join("|");
if (migratedNames !== "Aldi|Costco|No store|Trader Joe's") {
  console.error("Legacy grocery tags should become store sections", migrated.stores);
  process.exit(1);
}
const costco = migrated.stores.find((store) => store.name === "Costco");
if (!costco || costco.items.length !== 1 || costco.items[0].name !== "Chicken") {
  console.error("Legacy items should land in their tagged store", costco);
  process.exit(1);
}
const emptyStore = migrated.stores.find((store) => store.name === "Trader Joe's");
if (!emptyStore || emptyStore.items.length) {
  console.error("Custom stores without items should stay visible", emptyStore);
  process.exit(1);
}

console.log(`OK: ${SEED_MEALS.length} seed meals, 7-day plan, ${SEED_MIDWEEK.length} midweek items`);
