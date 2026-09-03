export const FAMILY = "Littlefields";

export const DAYS = [
  { id: "monday", label: "Monday", short: "Mon", compact: "M" },
  { id: "tuesday", label: "Tuesday", short: "Tue", compact: "Tu" },
  { id: "wednesday", label: "Wednesday", short: "Wed", compact: "W" },
  { id: "thursday", label: "Thursday", short: "Thu", compact: "Th" },
  { id: "friday", label: "Friday", short: "Fri", compact: "F" },
  { id: "saturday", label: "Saturday", short: "Sat", compact: "Sa" },
  { id: "sunday", label: "Sunday", short: "Sun", compact: "Su" },
];

export const SLOTS = [
  { id: "breakfast", label: "Breakfast", compact: "Bfast" },
  { id: "lunch", label: "Lunch", compact: "Lunch" },
  { id: "dinner", label: "Dinner", compact: "Dinner" },
  { id: "snack", label: "Snack", compact: "Snack" },
];

export const RECURRING_SLOTS = ["breakfast", "lunch", "snack"];

export const TYPE_ORDER = ["breakfast", "lunch", "dinner", "snack"];

const meal = (partial) => ({
  notes: "",
  recipeUrl: "",
  ingredients: [],
  makeAhead: false,
  seed: true,
  ...partial,
});

export function normalizeIngredients(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export const SEED_MEALS = [
  meal({
    id: "boiled-eggs-toast",
    name: "2 boiled eggs, toast",
    types: ["breakfast"],
    notes: "From the weekly plan. Related Sunday prep: boiled eggs and smoothies.",
  }),
  meal({
    id: "boiled-eggs-smoothies",
    name: "Boiled eggs, smoothies",
    types: ["breakfast"],
    makeAhead: true,
    notes: "Make-ahead breakfast — prep Sunday night.",
  }),
  meal({
    id: "ham-sandwich",
    name: "Ham sandwich",
    types: ["lunch"],
  }),
  meal({
    id: "spaghetti",
    name: "Spaghetti",
    types: ["dinner"],
    notes: "Weekly plan often serves this with toast and peas.",
  }),
  meal({
    id: "apples-and-pb",
    name: "Apples and pb",
    types: ["snack"],
  }),
  meal({
    id: "burritos",
    name: "Burritos",
    types: ["breakfast", "dinner"],
    makeAhead: true,
    notes: "Works for breakfast or dinner. Make ahead. Tuesday dinner is often served with rice and corn.",
  }),
  meal({
    id: "banana-sandwich",
    name: "Banana sandwich",
    types: ["lunch"],
  }),
  meal({
    id: "cottage-cheese-crackers",
    name: "Cottage cheese, crackers",
    types: ["snack"],
  }),
  meal({
    id: "sandwiches",
    name: "Sandwiches",
    types: ["breakfast", "lunch"],
    makeAhead: true,
    notes: "Make-ahead breakfast. Use whatever filling is on hand.",
  }),
  meal({
    id: "tuna-sandwich",
    name: "Tuna sandwich",
    types: ["lunch"],
  }),
  meal({
    id: "lettuce-wraps",
    name: "Lettuce wraps, pot stickers, peas",
    types: ["dinner"],
  }),
  meal({
    id: "ants-on-a-log",
    name: "Ants on a log",
    types: ["snack"],
  }),
  meal({
    id: "protein-pancakes",
    name: "Protein Pancakes",
    types: ["breakfast"],
  }),
  meal({
    id: "turkey-cheese-roll-up",
    name: "Turkey, cheese roll up",
    types: ["lunch"],
  }),
  meal({
    id: "ck-green-bean-casserole",
    name: "Chicken green bean casserole",
    types: ["dinner"],
    notes: "Dinner idea list: Ck green bean casserole. Weekly plan often adds carrots and homemade bread.",
  }),
  meal({
    id: "protein-shake",
    name: "Protein shake",
    types: ["snack"],
  }),
  meal({
    id: "scrambled-eggs-bacon",
    name: "Scrambled eggs, bacon",
    types: ["breakfast"],
  }),
  meal({
    id: "pb-honey-sandwich",
    name: "Pb, honey sandwich",
    types: ["lunch"],
  }),
  meal({
    id: "beef-stroganoff",
    name: "Beef stroganoff",
    types: ["dinner"],
  }),
  meal({
    id: "bananas-pb-cheese",
    name: "Bananas, pb, cheese stick",
    types: ["snack"],
  }),
  meal({
    id: "crepes",
    name: "Crepes",
    types: ["breakfast"],
    makeAhead: true,
    notes: "Make-ahead breakfast. See also savory crepes for dinner.",
  }),
  meal({
    id: "hot-dogs",
    name: "Hot dogs",
    types: ["lunch"],
  }),
  meal({
    id: "bbq-pork-sandwiches",
    name: "Bbq pork sandwiches",
    types: ["dinner"],
    notes: "Saturday weekly plan: pork sandwiches.",
  }),
  meal({
    id: "eggs-cereal",
    name: "Eggs, cereal",
    types: ["breakfast"],
  }),
  meal({
    id: "egg-salad-sandwich",
    name: "Egg salad sandwich",
    types: ["lunch"],
  }),
  meal({
    id: "chicken-pillows",
    name: "Chicken pillows",
    types: ["dinner"],
    notes: "Weekly plan often serves this with corn and salad.",
  }),
  meal({
    id: "white-ck-chili",
    name: "White ck chili",
    types: ["dinner"],
  }),
  meal({
    id: "enchiladas",
    name: "Enchiladas",
    types: ["dinner"],
  }),
  meal({
    id: "tacos",
    name: "Tacos",
    types: ["dinner"],
  }),
  meal({
    id: "shrimp",
    name: "Shrimp",
    types: ["dinner"],
  }),
  meal({
    id: "fried-rice",
    name: "Fried Rice",
    types: ["dinner"],
  }),
  meal({
    id: "meatloaf",
    name: "Meatloaf",
    types: ["dinner"],
  }),
  meal({
    id: "chicken",
    name: "Chicken",
    types: ["dinner"],
  }),
  meal({
    id: "breakfast-casserole",
    name: "Breakfast casserole",
    types: ["breakfast", "dinner"],
  }),
  meal({
    id: "ham-sliders",
    name: "Ham sliders",
    types: ["dinner"],
  }),
  meal({
    id: "savory-crepes",
    name: "Savory crepes",
    types: ["dinner"],
  }),
  meal({
    id: "chicken-thighs-costco",
    name: "Chicken thighs (Costco)",
    types: ["dinner"],
    notes: "Costco.",
  }),
  meal({
    id: "chili-mac",
    name: "Chili Mac",
    types: ["dinner"],
  }),
  meal({
    id: "ranch-sheet-chicken",
    name: "Ranch sheet chicken breasts",
    types: ["dinner"],
  }),
  meal({
    id: "baked-roast-ranch",
    name: "Baked roast w ranch",
    types: ["dinner"],
  }),
  meal({
    id: "panko-chicken-sandwiches",
    name: "Chicken sandwiches w panko chicken",
    types: ["dinner"],
  }),
  meal({
    id: "sheet-pan-chicken",
    name: "Sheet pan chicken",
    types: ["dinner"],
  }),
  meal({
    id: "lisa-tostadas",
    name: "Lisa tostadas",
    types: ["dinner"],
  }),
  meal({
    id: "hawaiian-haystacks",
    name: "Hawaiian haystacks",
    types: ["dinner"],
  }),
  meal({
    id: "roast",
    name: "Roast",
    types: ["dinner"],
  }),
  meal({
    id: "taco-bowls",
    name: "Taco bowls",
    types: ["dinner"],
  }),
  meal({
    id: "curry-chicken-costco",
    name: "Curry chicken (Costco)",
    types: ["dinner"],
    notes: "Costco.",
  }),
  meal({
    id: "florentine-ck-costco",
    name: "Florentine Ck (Costco)",
    types: ["dinner"],
    notes: "Costco.",
  }),
  meal({
    id: "tilapia",
    name: "Tilapia",
    types: ["dinner"],
  }),
  meal({
    id: "hamburgers",
    name: "Hamburgers",
    types: ["dinner"],
  }),
  meal({
    id: "taquitos",
    name: "Taquitos",
    types: ["dinner"],
    recipeUrl: "https://ourbestbites.com/baked-creamy-chicken-taquitos/?utm_source=pinterest&utm_medium=social",
    notes: "Baked creamy chicken taquitos.",
  }),
  meal({
    id: "meatballs-and-sauce",
    name: "Meatballs and sauce",
    types: ["dinner"],
  }),
  meal({
    id: "chicken-alfredo",
    name: "Chicken Alfredo",
    types: ["dinner"],
    recipeUrl: "https://valentinascorner.com/alfredo-sauce-recipe/",
  }),
  meal({
    id: "tater-tot-casserole",
    name: "Tater tot casserole",
    types: ["dinner"],
  }),
  meal({
    id: "hamburger-sliders",
    name: "Hamburger sliders",
    types: ["dinner"],
  }),
  meal({
    id: "beach-club-sandwiches",
    name: "Beach club sandwiches",
    types: ["dinner"],
  }),
  meal({
    id: "shrimp-linguine",
    name: "Shrimp linguine",
    types: ["dinner"],
  }),
  meal({
    id: "pork-tacos",
    name: "Pork tacos",
    types: ["dinner"],
  }),
];

const slot = (mealId, label = "") => ({ mealId, label });

export const SEED_PLAN = {
  monday: {
    breakfast: slot("boiled-eggs-toast", "2 boiled eggs, toast"),
    lunch: slot("ham-sandwich", "Ham sandwich"),
    dinner: slot("spaghetti", "Spaghetti, toast, peas"),
    snack: slot("apples-and-pb", "Apples and pb"),
  },
  tuesday: {
    breakfast: slot("burritos", "Burritos"),
    lunch: slot("banana-sandwich", "Banana sandwich"),
    dinner: slot("burritos", "Burritos, rice, corn"),
    snack: slot("cottage-cheese-crackers", "Cottage cheese, crackers"),
  },
  wednesday: {
    breakfast: slot("sandwiches", "Sandwiches"),
    lunch: slot("tuna-sandwich", "Tuna sandwich"),
    dinner: slot("lettuce-wraps", "Lettuce wraps, pot stickers, peas"),
    snack: slot("ants-on-a-log", "Ants on a log"),
  },
  thursday: {
    breakfast: slot("protein-pancakes", "Protein Pancakes"),
    lunch: slot("turkey-cheese-roll-up", "Turkey, cheese roll up"),
    dinner: slot("ck-green-bean-casserole", "Chicken green bean casserole, carrots, homemade bread"),
    snack: slot("protein-shake", "Protein shake"),
  },
  friday: {
    breakfast: slot("scrambled-eggs-bacon", "Scrambled eggs, bacon"),
    lunch: slot("pb-honey-sandwich", "Pb, honey sandwich"),
    dinner: slot("beef-stroganoff", "Beef stroganoff"),
    snack: slot("bananas-pb-cheese", "Bananas, pb, cheese stick"),
  },
  saturday: {
    breakfast: slot("crepes", "Crepes"),
    lunch: slot("hot-dogs", "Hot dogs"),
    dinner: slot("bbq-pork-sandwiches", "Pork sandwiches"),
    snack: slot(null, ""),
  },
  sunday: {
    breakfast: slot("eggs-cereal", "Eggs, cereal"),
    lunch: slot("egg-salad-sandwich", "Egg salad sandwich"),
    dinner: slot("chicken-pillows", "Chicken pillows, corn, salad"),
    snack: slot(null, ""),
  },
};

export const SEED_MIDWEEK = [
  { id: "salad-kit", name: "Salad kit" },
  { id: "chicken-th-sun", name: "Chicken (Th, Sun)" },
  { id: "cantaloupe", name: "Cantaloupe" },
];

export function todayDayId(now = new Date()) {
  const map = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[now.getDay()];
}

export function startOfLocalDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function usShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function mondayOfWeek(date) {
  const start = startOfLocalDay(date);
  const sundayBased = start.getDay();
  const offset = sundayBased === 0 ? 6 : sundayBased - 1;
  start.setDate(start.getDate() - offset);
  return start;
}

export function isInCurrentPlanWeek(date, now = new Date()) {
  const start = mondayOfWeek(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const day = startOfLocalDay(date);
  return day >= start && day < end;
}

export function emptySlot() {
  return { mealId: null, label: "" };
}

export function emptySlots() {
  return {
    breakfast: emptySlot(),
    lunch: emptySlot(),
    dinner: emptySlot(),
    snack: emptySlot(),
  };
}

export function emptyRecurring() {
  return {
    breakfast: emptySlot(),
    lunch: emptySlot(),
    snack: emptySlot(),
  };
}

export function daysStartingToday(now = new Date()) {
  return rollingDays(now).map((day) => DAYS.find((item) => item.id === day.weekdayId));
}

export function rollingDays(now = new Date()) {
  const start = startOfLocalDay(now);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const weekdayId = todayDayId(date);
    const meta = DAYS.find((item) => item.id === weekdayId);
    days.push({
      key: localDateKey(date),
      weekdayId,
      label: meta.label,
      short: meta.short,
      compact: meta.compact,
      dateLabel: usShortDate(date),
      title: `${meta.label} (${usShortDate(date)})`,
      isToday: i === 0,
      seedable: isInCurrentPlanWeek(date, now),
    });
  }
  return days;
}

const STORE_COLORS = {
  costco: { bg: "#d6e6f7", fg: "#1d4d86" },
  walmart: { bg: "#d4efe4", fg: "#0b5c3c" },
  target: { bg: "#f8d6dc", fg: "#9a1c30" },
  "smith's": { bg: "#e5dcf6", fg: "#4a2a7a" },
  aldi: { bg: "#f4e3c0", fg: "#7a4a0c" },
};

const STORE_FALLBACK = [
  { bg: "#f3ddd0", fg: "#7a3b1c" },
  { bg: "#d7eef2", fg: "#1b5c66" },
  { bg: "#eee3c9", fg: "#6b5310" },
  { bg: "#e8d6e8", fg: "#6a2d63" },
  { bg: "#dce8d4", fg: "#3a5a22" },
];

export function storeKey(name) {
  return String(name || "").trim().toLowerCase();
}

export function storeColor(name) {
  const key = storeKey(name);
  if (!key) return { bg: "#ece6dc", fg: "#5c564c" };
  if (STORE_COLORS[key]) return STORE_COLORS[key];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return STORE_FALLBACK[hash % STORE_FALLBACK.length];
}

export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
