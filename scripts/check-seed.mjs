import { SEED_MEALS, SEED_PLAN, SEED_MIDWEEK, DAYS, SLOTS, daysStartingToday, emptySlot, normalizeIngredients, rollingDays } from "../src/data.js";
import { clearDayPlan, dayHasMeals, freshPlan, migrateLegacyGrocery, migratePlanToV4, resolveDayPlan, setPlanSlot, slotHasMeal, swapDaySlots } from "../src/storage.js";

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

if (DAYS.map((day) => day.compact).join(",") !== "M,Tu,W,Th,F,Sa,Su") {
  console.error("Compact weekday labels must stay unambiguous", DAYS.map((day) => day.compact));
  process.exit(1);
}

const plan = freshPlan(thursday);
const thursdayPlan = resolveDayPlan(plan, rolling[0]);
if (thursdayPlan.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Current-week Thursday should use seed dinner");
  process.exit(1);
}
if (thursdayPlan.breakfast.mealId !== "protein-pancakes") {
  console.error("Thursday breakfast should come from the weekday template");
  process.exit(1);
}

const nextMonday = resolveDayPlan(plan, rolling[4]);
if (nextMonday.breakfast.mealId !== "boiled-eggs-toast") {
  console.error("Next Monday should keep recurring breakfast", nextMonday.breakfast);
  process.exit(1);
}
if (slotHasMeal(nextMonday.dinner)) {
  console.error("Next Monday dinner should start blank", nextMonday.dinner);
  process.exit(1);
}

const nextWeekThursday = rollingDays(new Date("2026-09-10T12:00:00"))[0];
const rolledThursday = resolveDayPlan(plan, nextWeekThursday);
if (rolledThursday.breakfast.mealId !== "protein-pancakes" || rolledThursday.lunch.mealId !== "turkey-cheese-roll-up") {
  console.error("Next week Thursday should keep recurring breakfast/lunch", rolledThursday);
  process.exit(1);
}
if (slotHasMeal(rolledThursday.dinner)) {
  console.error("Next week Thursday dinner should stay blank", rolledThursday.dinner);
  process.exit(1);
}

if (!dayHasMeals(plan, rolling[0])) {
  console.error("Seeded Thursday should report meals");
  process.exit(1);
}
if (!dayHasMeals(plan, rolling[4])) {
  console.error("Next Monday should still report recurring meals");
  process.exit(1);
}

const writable = freshPlan(thursday);
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
if (slotHasMeal(writable.dinners["2026-09-03"])) {
  console.error("Clear must persist the empty Thursday dinner", writable.dinners["2026-09-03"]);
  process.exit(1);
}
if (writable.dinners["2026-09-04"]?.mealId !== "beef-stroganoff") {
  console.error("Clear must not touch Friday dinner", writable.dinners);
  process.exit(1);
}
if (writable.weekdays.friday.breakfast.mealId !== "scrambled-eggs-bacon") {
  console.error("Clear must not wipe other weekday templates", writable.weekdays.friday);
  process.exit(1);
}
const nextClearedThursday = resolveDayPlan(writable, nextWeekThursday);
if (slotHasMeal(nextClearedThursday.breakfast) || slotHasMeal(nextClearedThursday.lunch) || slotHasMeal(nextClearedThursday.snack)) {
  console.error("Clearing Thursday should clear the recurring weekday template", nextClearedThursday);
  process.exit(1);
}

const edited = freshPlan(thursday);
setPlanSlot(edited, rolling[0], "breakfast", emptySlot());
if (slotHasMeal(resolveDayPlan(edited, rolling[0]).breakfast) || slotHasMeal(resolveDayPlan(edited, nextWeekThursday).breakfast)) {
  console.error("User-cleared Thursday breakfast must not re-seed next week");
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

const swapped = freshPlan(thursday);
swapDaySlots(swapped, rolling[0], rolling[1], "dinner");
const thuAfterSwap = resolveDayPlan(swapped, rolling[0]);
const friAfterSwap = resolveDayPlan(swapped, rolling[1]);
if (thuAfterSwap.dinner.mealId !== "beef-stroganoff" || friAfterSwap.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Thursday and Friday dinners should swap", thuAfterSwap.dinner, friAfterSwap.dinner);
  process.exit(1);
}
if (thuAfterSwap.breakfast.mealId !== "protein-pancakes" || friAfterSwap.breakfast.mealId !== "scrambled-eggs-bacon") {
  console.error("Dinner swap must not move other meal types");
  process.exit(1);
}

const moved = freshPlan(thursday);
swapDaySlots(moved, rolling[0], rolling[4], "lunch");
const thuAfterMove = resolveDayPlan(moved, rolling[0]);
const monAfterMove = resolveDayPlan(moved, rolling[4]);
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
const nextThuAfterLunchSwap = resolveDayPlan(moved, nextWeekThursday);
if (nextThuAfterLunchSwap.lunch.mealId !== "ham-sandwich") {
  console.error("Recurring lunch swap should persist into next week", nextThuAfterLunchSwap.lunch);
  process.exit(1);
}

const migrated = migratePlanToV4(
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
if (migrated.dinners["2026-09-03"].mealId !== "tacos") {
  console.error("v3 Thursday dinner should stay date-keyed", migrated.dinners["2026-09-03"]);
  process.exit(1);
}
if (migrated.dinners["2026-09-04"].mealId !== "beef-stroganoff") {
  console.error("Current-week dinners missing from v3 should keep the seed", migrated.dinners);
  process.exit(1);
}
if (slotHasMeal(migrated.dinners["2026-09-07"] || emptySlot())) {
  console.error("Future dinners must not be seeded during migration", migrated.dinners);
  process.exit(1);
}

const migratedClear = migratePlanToV4(
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
if (slotHasMeal(migratedClear.dinners["2026-09-03"])) {
  console.error("User-cleared v3 dinner must stay empty after migration", migratedClear.dinners["2026-09-03"]);
  process.exit(1);
}

const alreadyV4 = migratePlanToV4(
  {
    version: 4,
    weekdays: {
      thursday: {
        breakfast: { mealId: null, label: "" },
        lunch: { mealId: "ham-sandwich", label: "Ham sandwich" },
        snack: { mealId: null, label: "" },
      },
    },
    dinners: {},
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

console.log(`OK: ${SEED_MEALS.length} seed meals, 7-day plan, ${SEED_MIDWEEK.length} midweek items`);
