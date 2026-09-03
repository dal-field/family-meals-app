import { SEED_MEALS, SEED_PLAN, SEED_MIDWEEK, DAYS, SLOTS, emptySlot, formatWeekRange, localDateKey, normalizeIngredients, rollingDays, shiftMonday } from "../src/data.js";
import { scaleSize } from "../src/photos.js";
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
const rolling = rollingDays(thursday);
const dayByWeekday = (days, id) => days.find((day) => day.weekdayId === id);
if (rolling.map((day) => day.compact).join(",") !== "M,Tu,W,Th,F,Sa,Su") {
  console.error("Week must be Monday–Sunday top to bottom", rolling.map((day) => day.compact));
  process.exit(1);
}
if (rolling.map((day) => day.title).join("|") !== "Monday (8/31)|Tuesday (9/1)|Wednesday (9/2)|Thursday (9/3)|Friday (9/4)|Saturday (9/5)|Sunday (9/6)") {
  console.error("Calendar-week titles mismatch", rolling.map((day) => day.title));
  process.exit(1);
}
if (rolling.filter((day) => day.seedable).map((day) => day.key).join(",") !== "2026-08-31,2026-09-01,2026-09-02,2026-09-03,2026-09-04,2026-09-05,2026-09-06") {
  console.error("Current Mon–Sun week should be seedable", rolling);
  process.exit(1);
}
if (!dayByWeekday(rolling, "thursday").isToday || dayByWeekday(rolling, "monday").isToday) {
  console.error("Today highlight must stay on Thursday, not the first row");
  process.exit(1);
}

if (DAYS.map((day) => day.compact).join(",") !== "M,Tu,W,Th,F,Sa,Su") {
  console.error("Compact weekday labels must stay unambiguous", DAYS.map((day) => day.compact));
  process.exit(1);
}

const thisThursday = dayByWeekday(rolling, "thursday");
const thisFriday = dayByWeekday(rolling, "friday");
const thisMonday = dayByWeekday(rolling, "monday");
const nextWeek = rollingDays(new Date("2026-09-10T12:00:00"));
const nextWeekMonday = dayByWeekday(nextWeek, "monday");
const nextWeekThursday = dayByWeekday(nextWeek, "thursday");

const plan = freshPlan(thursday);
const thursdayPlan = resolveDayPlan(plan, thisThursday);
if (thursdayPlan.dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Current-week Thursday should use seed dinner");
  process.exit(1);
}
if (thursdayPlan.breakfast.mealId !== "protein-pancakes") {
  console.error("Thursday breakfast should come from the weekday template");
  process.exit(1);
}

const thisMondayPlan = resolveDayPlan(plan, thisMonday);
if (thisMondayPlan.breakfast.mealId !== "boiled-eggs-toast") {
  console.error("This Monday should keep recurring breakfast", thisMondayPlan.breakfast);
  process.exit(1);
}
if (thisMondayPlan.dinner.mealId !== "spaghetti") {
  console.error("This Monday dinner should stay on this calendar week", thisMondayPlan.dinner);
  process.exit(1);
}

const nextMonday = resolveDayPlan(plan, nextWeekMonday);
if (nextMonday.breakfast.mealId !== "boiled-eggs-toast") {
  console.error("Next Monday should keep recurring breakfast", nextMonday.breakfast);
  process.exit(1);
}
if (slotHasMeal(nextMonday.dinner)) {
  console.error("Next Monday dinner should start blank", nextMonday.dinner);
  process.exit(1);
}

const rolledThursday = resolveDayPlan(plan, nextWeekThursday);
if (rolledThursday.breakfast.mealId !== "protein-pancakes" || rolledThursday.lunch.mealId !== "turkey-cheese-roll-up") {
  console.error("Next week Thursday should keep recurring breakfast/lunch", rolledThursday);
  process.exit(1);
}
if (slotHasMeal(rolledThursday.dinner)) {
  console.error("Next week Thursday dinner should stay blank", rolledThursday.dinner);
  process.exit(1);
}

const laterNow = new Date("2026-09-17T12:00:00");
const pastWeek = rollingDays(thursday, laterNow);
const historicThursday = dayByWeekday(pastWeek, "thursday");
if (historicThursday.key !== "2026-09-03") {
  console.error("Browsing back should still open the original Thursday date", historicThursday);
  process.exit(1);
}
if (resolveDayPlan(plan, historicThursday).dinner.mealId !== "ck-green-bean-casserole") {
  console.error("Past dinners must remain when navigating back to that week", resolveDayPlan(plan, historicThursday).dinner);
  process.exit(1);
}

if (formatWeekRange(new Date("2026-04-03T12:00:00"), new Date("2026-04-09T12:00:00")) !== "Apr 3 – 9") {
  console.error("Same-month week range should omit the repeated month");
  process.exit(1);
}
if (formatWeekRange(new Date("2026-08-31T12:00:00"), new Date("2026-09-06T12:00:00")) !== "Aug 31 – Sep 6") {
  console.error("Cross-month week range should name both months");
  process.exit(1);
}
if (formatWeekRange(new Date("2026-12-28T12:00:00"), new Date("2027-01-03T12:00:00")) !== "Dec 28 – Jan 3, 2027") {
  console.error("Year-crossing week range should include the end year");
  process.exit(1);
}
if (localDateKey(shiftMonday(thursday, 1)) !== "2026-09-07" || localDateKey(shiftMonday(thursday, -1)) !== "2026-08-24") {
  console.error("Week arrows should move by full Monday–Sunday weeks");
  process.exit(1);
}

if (!dayHasMeals(plan, thisThursday)) {
  console.error("Seeded Thursday should report meals");
  process.exit(1);
}
if (!dayHasMeals(plan, nextWeekMonday)) {
  console.error("Next Monday should still report recurring meals");
  process.exit(1);
}

const writable = freshPlan(thursday);
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
setPlanSlot(edited, thisThursday, "breakfast", emptySlot());
if (slotHasMeal(resolveDayPlan(edited, thisThursday).breakfast) || slotHasMeal(resolveDayPlan(edited, nextWeekThursday).breakfast)) {
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

const moved = freshPlan(thursday);
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

const migratedFutureEmpty = migratePlanToV4(
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

console.log(`OK: ${SEED_MEALS.length} seed meals, 7-day plan, ${SEED_MIDWEEK.length} midweek items`);
