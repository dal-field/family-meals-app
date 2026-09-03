import {
  DAYS,
  FAMILY,
  SEED_MEALS,
  SLOTS,
  STORE_PRESETS,
  TYPE_ORDER,
  daysStartingToday,
  slugify,
  storeColor,
  storeKey,
  todayDayId,
} from "./data.js";
import {
  deleteUserMeal,
  hideSeedMeal,
  loadGrocery,
  loadMeals,
  loadPlan,
  saveGrocery,
  savePlan,
  saveSeedEdit,
  saveUserMeal,
} from "./storage.js";

const TYPE_LABEL = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const TABS = [
  { id: "week", label: "This Week" },
  { id: "meals", label: "Meals" },
  { id: "groceries", label: "Groceries" },
  { id: "add", label: "Add" },
];

function emptyForm() {
  return {
    name: "",
    types: [],
    notes: "",
    recipeUrl: "",
    ingredients: "",
    makeAhead: false,
  };
}

export function createApp(root) {
  const state = {
    tab: "week",
    meals: loadMeals(),
    plan: loadPlan(),
    grocery: loadGrocery(),
    query: "",
    mealFilter: "all",
    showHidden: false,
    selectedId: null,
    picker: null,
    expandedDay: todayDayId(),
    pickerQuery: "",
    oneOff: "",
    editingId: null,
    form: emptyForm(),
    groceryDraft: "",
    groceryStore: "",
    groceryStoreOther: "",
    toast: "",
  };

  let toastTimer = 0;

  function toast(message) {
    state.toast = message;
    render();
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      state.toast = "";
      render();
    }, 2200);
  }

  function refresh() {
    state.meals = loadMeals();
  }

  function mealById(id) {
    return state.meals.find((meal) => meal.id === id) || null;
  }

  function visibleMeals() {
    return state.meals.filter((meal) => state.showHidden || !meal.hidden);
  }

  function slotText(slot) {
    if (slot.label) return slot.label;
    if (slot.mealId) {
      const meal = mealById(slot.mealId);
      if (meal) return meal.name;
    }
    return "";
  }

  function parseHash() {
    const hash = (location.hash || "#week").replace(/^#/, "");
    const [tab, extra] = hash.split("/");
    if (TABS.some((item) => item.id === tab)) state.tab = tab;
    else state.tab = "week";

    state.selectedId = state.tab === "meals" && extra ? extra : null;

    if (state.tab === "add" && extra) {
      const meal = mealById(extra);
      if (meal) fillForm(meal);
    } else if (state.tab === "add" && !extra && !state.editingId) {
      state.form = emptyForm();
    }
  }

  function go(hash) {
    if (location.hash === `#${hash}`) {
      parseHash();
      render();
      return;
    }
    location.hash = hash;
  }

  function fillForm(meal) {
    state.editingId = meal.id;
    state.form = {
      name: meal.name,
      types: [...meal.types],
      notes: meal.notes || "",
      recipeUrl: meal.recipeUrl || "",
      ingredients: meal.ingredients || "",
      makeAhead: Boolean(meal.makeAhead),
    };
  }

  function filteredLibrary(query, type) {
    const q = query.trim().toLowerCase();
    return visibleMeals()
      .filter((meal) => {
        if (type === "makeAhead") return meal.makeAhead;
        if (type !== "all" && !meal.types.includes(type)) return false;
        if (!q) return true;
        const blob = [meal.name, meal.notes, meal.ingredients, meal.recipeUrl].join(" ").toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function persistMeal(meal) {
    if (SEED_MEALS.some((seed) => seed.id === meal.id)) saveSeedEdit(meal);
    else saveUserMeal(meal);
    refresh();
  }

  function render() {
    const today = todayDayId();
    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div>
            <p class="kicker">${FAMILY}</p>
            <h1>${headerTitle()}</h1>
          </div>
        </header>
        ${view()}
      </div>
      <nav class="nav" aria-label="Main">
        ${TABS.map(
          (tab) => `
            <button class="nav-btn ${state.tab === tab.id ? "is-on" : ""}" data-tab="${tab.id}" type="button">
              ${tab.label}
            </button>`
        ).join("")}
      </nav>
      ${state.selectedId ? mealSheet() : ""}
      ${state.picker ? pickerSheet() : ""}
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
    `;

    bind(today);
  }

  function headerTitle() {
    if (state.tab === "week") return "This week";
    if (state.tab === "meals") return "Meals";
    if (state.tab === "groceries") return "Groceries";
    return state.editingId ? "Edit meal" : "Add meal";
  }

  function view() {
    if (state.tab === "week") return weekView();
    if (state.tab === "meals") return mealsView();
    if (state.tab === "groceries") return groceryView();
    return addView();
  }

  function weekView() {
    const today = todayDayId();
    const dinner = slotText(state.plan[today].dinner) || "Nothing planned";
    const makeAhead = visibleMeals().filter((meal) => meal.makeAhead);

    return `
      <section class="card hero today-dinner">
        <div class="label">Tonight’s dinner</div>
        <h2>${escapeHtml(dinner)}</h2>
        <p class="meta">${escapeHtml(dayLabel(today))} · tap any slot below to change it</p>
      </section>

      <div class="week-list">
        ${daysStartingToday().map((day) => dayCard(day, today)).join("")}
      </div>

      <section class="section">
        <article class="card prep-card">
          <h2>Make-ahead breakfasts</h2>
          <p class="hint">Prep Sunday night so weekday mornings are easier.</p>
          <ul class="prep-list">
            ${makeAhead
              .map(
                (meal) => `
                  <li>
                    <button type="button" data-open-meal="${meal.id}">
                      <span class="meal-name">${escapeHtml(meal.name)}</span>
                      <span class="meal-meta">View</span>
                    </button>
                  </li>`
              )
              .join("")}
          </ul>
        </article>
      </section>
    `;
  }

  function dayCard(day, today) {
    const open = state.expandedDay === day.id;
    const dinner = slotText(state.plan[day.id].dinner);
    return `
      <article class="card day-card ${day.id === today ? "is-today" : ""} ${open ? "is-open" : "is-collapsed"}">
        <button class="day-toggle" type="button" data-toggle-day="${day.id}" aria-expanded="${open}">
          <span class="day-toggle-text">
            <span class="day-title-row">
              <h3>${day.label}</h3>
              ${day.id === today ? `<span class="today-pill">Today</span>` : ""}
            </span>
            ${
              open
                ? ""
                : `<span class="day-summary">${escapeHtml(dinner || "No dinner planned")}</span>`
            }
          </span>
          <span class="chevron" aria-hidden="true">${open ? "▴" : "▾"}</span>
        </button>
        ${
          open
            ? `<div class="slots">
          ${SLOTS.map((slot) => {
            const value = slotText(state.plan[day.id][slot.id]);
            return `
              <button
                class="slot-btn ${slot.id === "dinner" ? "is-dinner" : ""} ${value ? "" : "is-empty"}"
                type="button"
                data-day="${day.id}"
                data-slot="${slot.id}"
              >
                <span class="kind">${slot.label}</span>
                <span class="value">${escapeHtml(value || "Tap to add")}</span>
              </button>`;
          }).join("")}
        </div>`
            : ""
        }
      </article>
    `;
  }

  function mealsView() {
    const meals = filteredLibrary(state.query, state.mealFilter);
    const hiddenCount = state.meals.filter((meal) => meal.hidden).length;
    const filters = [
      ["all", "All"],
      ["breakfast", "Breakfast"],
      ["lunch", "Lunch"],
      ["dinner", "Dinner"],
      ["snack", "Snack"],
      ["makeAhead", "Make-ahead"],
    ];

    return `
      <input class="search" type="search" placeholder="Search meals" value="${escapeAttr(state.query)}" data-search />
      <div class="filters" role="tablist" aria-label="Meal type">
        ${filters
          .map(
            ([id, label]) => `
              <button class="chip ${state.mealFilter === id ? "is-on" : ""}" type="button" data-filter="${id}">
                ${label}
              </button>`
          )
          .join("")}
      </div>
      <p class="hint">${meals.length} meal${meals.length === 1 ? "" : "s"}</p>
      <div class="meal-list">
        ${
          meals.length
            ? meals
                .map(
                  (meal) => `
                    <button class="meal-row" type="button" data-open-meal="${meal.id}">
                      <span class="meal-main">
                        <span class="meal-name">${escapeHtml(meal.name)}</span>
                        <span class="meal-meta">${mealMeta(meal)}</span>
                      </span>
                      <span class="meal-meta">${meal.hidden ? "Hidden" : meal.recipeUrl ? "Recipe" : ""}</span>
                    </button>`
                )
                .join("")
            : `<p class="empty">No meals match that search.</p>`
        }
      </div>
      ${
        hiddenCount
          ? `<button class="ghost hidden-toggle" type="button" data-toggle-hidden>
              ${state.showHidden ? "Hide hidden meals" : `Show ${hiddenCount} hidden meal${hiddenCount === 1 ? "" : "s"}`}
            </button>`
          : ""
      }
    `;
  }

  function groceryView() {
    const groups = groupGroceryItems(state.grocery.items);
    return `
      <p class="hint">Add what you need and tag a store if you want. The list groups by store and stays on this phone.</p>
      <div class="card grocery-add">
        <input class="search" style="margin:0" type="text" placeholder="Add an item" value="${escapeAttr(state.groceryDraft)}" data-grocery-draft />
        <div class="grocery-add-row">
          <select class="store-select" data-grocery-store aria-label="Store">
            ${storeOptions(state.groceryStore)}
          </select>
          <button class="primary" type="button" data-add-grocery>Add</button>
        </div>
        ${
          state.groceryStore === "__other"
            ? `<input class="search" style="margin:0" type="text" placeholder="Store name" value="${escapeAttr(state.groceryStoreOther)}" data-grocery-store-other />`
            : ""
        }
      </div>
      ${
        groups.length
          ? groups
              .map((group) => {
                const color = storeColor(group.store);
                return `
                  <section class="section">
                    <h2 class="store-heading">
                      <span class="store-badge" style="background:${color.bg};color:${color.fg}">${escapeHtml(group.label)}</span>
                      <span class="hint">${group.items.length}</span>
                    </h2>
                    <div class="card">
                      ${group.items.map((item) => groceryRow(item)).join("")}
                    </div>
                  </section>`;
              })
              .join("")
          : `<p class="empty">Nothing on the list yet.</p>`
      }
    `;
  }

  function groceryRow(item) {
    const color = storeColor(item.store);
    return `
      <div class="grocery-item ${item.checked ? "is-done" : ""}">
        <label class="grocery-check">
          <input type="checkbox" ${item.checked ? "checked" : ""} data-grocery-check="${item.id}" />
          <span>${escapeHtml(item.name)}</span>
        </label>
        <select class="store-select store-select-row" data-grocery-retag="${item.id}" aria-label="Store for ${escapeAttr(item.name)}" style="background:${color.bg};color:${color.fg}">
          ${storeOptions(item.store, false)}
        </select>
        <button class="ghost grocery-delete" type="button" data-grocery-delete="${item.id}" aria-label="Remove ${escapeAttr(item.name)}">✕</button>
      </div>
    `;
  }

  function storeOptions(selected, includeOther = true) {
    const extras = (state.grocery.customStores || []).filter(
      (name) => !STORE_PRESETS.some((preset) => storeKey(preset) === storeKey(name))
    );
    const options = [
      ["", "No store"],
      ...STORE_PRESETS.map((name) => [name, name]),
      ...extras.map((name) => [name, name]),
    ];
    if (selected && selected !== "__other" && !options.some(([value]) => storeKey(value) === storeKey(selected))) {
      options.splice(1 + STORE_PRESETS.length, 0, [selected, selected]);
    }
    if (includeOther) options.push(["__other", "Other store…"]);
    const selectedKey = selected === "__other" ? "__other" : storeKey(selected);
    return options
      .map(([value, label]) => {
        const isOn =
          value === "__other"
            ? selected === "__other"
            : storeKey(value) === selectedKey && selected !== "__other";
        return `<option value="${escapeAttr(value)}" ${isOn ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function groupGroceryItems(items) {
    const buckets = new Map();
    for (const item of items) {
      const key = storeKey(item.store) || "__none";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    }

    const groups = [];
    for (const preset of STORE_PRESETS) {
      const key = storeKey(preset);
      if (buckets.has(key)) {
        groups.push({ store: preset, label: preset, items: buckets.get(key) });
        buckets.delete(key);
      }
    }

    const custom = [...buckets.keys()]
      .filter((key) => key !== "__none")
      .sort((a, b) => a.localeCompare(b));
    for (const key of custom) {
      const itemsIn = buckets.get(key);
      groups.push({ store: itemsIn[0].store, label: itemsIn[0].store, items: itemsIn });
    }

    if (buckets.has("__none")) {
      groups.push({ store: "", label: "No store", items: buckets.get("__none") });
    }
    return groups;
  }

  function addView() {
    const form = state.form;
    return `
      <form class="form card" style="padding:16px" data-meal-form>
        <label>
          Name
          <input name="name" required placeholder="e.g. Sheet pan nachos" value="${escapeAttr(form.name)}" />
        </label>
        <div>
          <div class="hint" style="margin-bottom:8px">Meal types</div>
          <div class="type-picks">
            ${TYPE_ORDER.map(
              (type) => `
                <label>
                  <input type="checkbox" name="types" value="${type}" ${form.types.includes(type) ? "checked" : ""} />
                  ${TYPE_LABEL[type]}
                </label>`
            ).join("")}
          </div>
        </div>
        <label>
          Notes
          <textarea name="notes" placeholder="Sides, Costco notes, reminders">${escapeHtml(form.notes)}</textarea>
        </label>
        <label>
          Recipe URL
          <input name="recipeUrl" type="text" inputmode="url" autocomplete="off" placeholder="https://" value="${escapeAttr(form.recipeUrl)}" />
        </label>
        <label>
          Ingredients
          <textarea name="ingredients" placeholder="One per line is fine">${escapeHtml(form.ingredients)}</textarea>
        </label>
        <label class="check-row">
          <input type="checkbox" name="makeAhead" ${form.makeAhead ? "checked" : ""} />
          Make-ahead
        </label>
        <div class="actions">
          <button class="primary" type="submit">${state.editingId ? "Save changes" : "Save meal"}</button>
          ${
            state.editingId
              ? `<button class="ghost" type="button" data-cancel-edit>Cancel</button>`
              : ""
          }
        </div>
      </form>
    `;
  }

  function mealSheet() {
    const meal = mealById(state.selectedId);
    if (!meal) return "";
    return `
      <div class="sheet-backdrop" data-close-sheet>
        <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="meal-title">
          <div class="sheet-body">
            <p class="kicker">${meal.seed ? "Family recipe" : "Your meal"}</p>
            <h2 id="meal-title">${escapeHtml(meal.name)}</h2>
            <div class="badge-row">
              ${meal.types.map((type) => `<span class="badge">${TYPE_LABEL[type]}</span>`).join("")}
              ${meal.makeAhead ? `<span class="badge">Make-ahead</span>` : ""}
              ${meal.hidden ? `<span class="badge">Hidden</span>` : ""}
            </div>
            ${
              meal.notes
                ? `<div class="detail-block"><h3>Notes</h3><p>${escapeHtml(meal.notes)}</p></div>`
                : ""
            }
            ${
              meal.ingredients
                ? `<div class="detail-block"><h3>Ingredients</h3><p>${escapeHtml(meal.ingredients)}</p></div>`
                : ""
            }
            ${
              meal.recipeUrl
                ? `<a class="recipe-link" href="${escapeAttr(meal.recipeUrl)}" target="_blank" rel="noopener noreferrer">Open recipe</a>`
                : ""
            }
          </div>
          <div class="actions sheet-actions">
            <button class="ghost" type="button" data-edit-meal="${meal.id}">Edit</button>
            ${
              meal.seed
                ? `<button class="danger" type="button" data-hide-meal="${meal.id}">${meal.hidden ? "Unhide" : "Hide"}</button>`
                : `<button class="danger" type="button" data-delete-meal="${meal.id}">Delete</button>`
            }
            <button class="ghost" type="button" data-close-sheet>Close</button>
          </div>
        </aside>
      </div>
    `;
  }

  function pickerSheet() {
    const { day, slot } = state.picker;
    const slotMeta = SLOTS.find((item) => item.id === slot);
    const current = slotText(state.plan[day][slot]);
    const meals = filteredLibrary(state.pickerQuery, slot);
    return `
      <div class="sheet-backdrop" data-close-picker>
        <aside class="sheet" role="dialog" aria-modal="true">
          <p class="kicker">${dayLabel(day)}</p>
          <h2>Change ${slotMeta.label.toLowerCase()}</h2>
          ${current ? `<p class="hint">Now: ${escapeHtml(current)}</p>` : ""}
          <input class="search" type="search" placeholder="Search the library" value="${escapeAttr(state.pickerQuery)}" data-picker-search />
          <form class="form" data-one-off>
            <label>
              Or type a one-off
              <input name="oneOff" value="${escapeAttr(state.oneOff)}" placeholder="Something simple for tonight" />
            </label>
          </form>
          <div class="sheet-body">
            <div class="meal-list">
              ${meals
                .slice(0, 40)
                .map(
                  (meal) => `
                    <button class="meal-row" type="button" data-pick-meal="${meal.id}">
                      <span class="meal-main">
                        <span class="meal-name">${escapeHtml(meal.name)}</span>
                        <span class="meal-meta">${mealMeta(meal)}</span>
                      </span>
                    </button>`
                )
                .join("")}
            </div>
          </div>
          <div class="actions sheet-actions">
            <button class="primary" type="button" data-submit-one-off>Use this</button>
            <button class="ghost" type="button" data-clear-slot>Clear slot</button>
            <button class="ghost" type="button" data-close-picker>Cancel</button>
          </div>
        </aside>
      </div>
    `;
  }

  function bind() {
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingId = null;
        state.form = emptyForm();
        go(button.dataset.tab);
      });
    });

    root.querySelectorAll("[data-toggle-day]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.toggleDay;
        state.expandedDay = state.expandedDay === id ? null : id;
        render();
      });
    });

    root.querySelectorAll("[data-day]").forEach((button) => {
      button.addEventListener("click", () => {
        state.picker = { day: button.dataset.day, slot: button.dataset.slot };
        state.pickerQuery = "";
        state.oneOff = "";
        render();
      });
    });

    root.querySelectorAll("[data-open-meal]").forEach((button) => {
      button.addEventListener("click", () => go(`meals/${button.dataset.openMeal}`));
    });

    root.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mealFilter = button.dataset.filter;
        render();
      });
    });

    const search = root.querySelector("[data-search]");
    if (search) {
      search.addEventListener("input", () => {
        const scrollY = window.scrollY;
        state.query = search.value;
        render();
        window.scrollTo(0, scrollY);
        const next = root.querySelector("[data-search]");
        if (next) {
          next.focus();
          next.setSelectionRange(state.query.length, state.query.length);
        }
      });
    }

    const hiddenToggle = root.querySelector("[data-toggle-hidden]");
    if (hiddenToggle) {
      hiddenToggle.addEventListener("click", () => {
        state.showHidden = !state.showHidden;
        render();
      });
    }

    root.querySelectorAll("[data-grocery-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const item = state.grocery.items.find((row) => row.id === input.dataset.groceryCheck);
        if (item) item.checked = input.checked;
        saveGrocery(state.grocery);
        render();
      });
    });

    root.querySelectorAll("[data-grocery-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        state.grocery.items = state.grocery.items.filter((row) => row.id !== button.dataset.groceryDelete);
        saveGrocery(state.grocery);
        render();
      });
    });

    root.querySelectorAll("[data-grocery-retag]").forEach((select) => {
      select.addEventListener("change", () => {
        const item = state.grocery.items.find((row) => row.id === select.dataset.groceryRetag);
        if (!item) return;
        item.store = select.value;
        rememberCustomStore(item.store);
        saveGrocery(state.grocery);
        render();
      });
    });

    const groceryDraft = root.querySelector("[data-grocery-draft]");
    if (groceryDraft) {
      groceryDraft.addEventListener("input", () => {
        state.groceryDraft = groceryDraft.value;
      });
    }

    const groceryStore = root.querySelector("[data-grocery-store]");
    if (groceryStore) {
      groceryStore.addEventListener("change", () => {
        state.groceryStore = groceryStore.value;
        render();
        const next = root.querySelector(state.groceryStore === "__other" ? "[data-grocery-store-other]" : "[data-grocery-draft]");
        if (next) next.focus();
      });
    }

    const groceryStoreOther = root.querySelector("[data-grocery-store-other]");
    if (groceryStoreOther) {
      groceryStoreOther.addEventListener("input", () => {
        state.groceryStoreOther = groceryStoreOther.value;
      });
    }

    const addGrocery = root.querySelector("[data-add-grocery]");
    if (addGrocery) {
      addGrocery.addEventListener("click", () => addGroceryItem());
    }
    if (groceryDraft) {
      groceryDraft.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addGroceryItem();
        }
      });
    }

    const form = root.querySelector("[data-meal-form]");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const name = String(data.get("name") || "").trim();
        if (!name) return;
        const types = [...form.querySelectorAll('input[name="types"]:checked')].map((input) => input.value);
        const meal = {
          id: state.editingId || uniqueId(name),
          name,
          types: types.length ? types : ["dinner"],
          notes: String(data.get("notes") || "").trim(),
          recipeUrl: String(data.get("recipeUrl") || "").trim(),
          ingredients: String(data.get("ingredients") || "").trim(),
          makeAhead: form.querySelector('[name="makeAhead"]').checked,
        };
        persistMeal(meal);
        state.editingId = null;
        state.form = emptyForm();
        toast("Saved on this phone");
        go(`meals/${meal.id}`);
      });
    }

    const cancel = root.querySelector("[data-cancel-edit]");
    if (cancel) {
      cancel.addEventListener("click", () => {
        state.editingId = null;
        state.form = emptyForm();
        go("add");
      });
    }

    root.querySelectorAll("[data-close-sheet]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("sheet-backdrop") && event.target !== node) return;
        state.selectedId = null;
        go("meals");
      });
    });

    root.querySelectorAll("[data-edit-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.editMeal);
        if (!meal) return;
        fillForm(meal);
        go(`add/${meal.id}`);
      });
    });

    root.querySelectorAll("[data-hide-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.hideMeal);
        if (!meal) return;
        hideSeedMeal(meal.id, !meal.hidden);
        refresh();
        toast(meal.hidden ? "Meal is back in the library" : "Hidden from the library");
        go("meals");
      });
    });

    root.querySelectorAll("[data-delete-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!confirm("Delete this meal from this phone?")) return;
        deleteUserMeal(button.dataset.deleteMeal);
        refresh();
        toast("Meal deleted");
        go("meals");
      });
    });

    root.querySelectorAll("[data-close-picker]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target === node) {
          state.picker = null;
          render();
        }
      });
    });

    const pickerSearch = root.querySelector("[data-picker-search]");
    if (pickerSearch) {
      pickerSearch.addEventListener("input", () => {
        state.pickerQuery = pickerSearch.value;
        render();
        const next = root.querySelector("[data-picker-search]");
        if (next) {
          next.focus();
          next.setSelectionRange(state.pickerQuery.length, state.pickerQuery.length);
        }
      });
    }

    root.querySelectorAll("[data-pick-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.pickMeal);
        if (!meal || !state.picker) return;
        state.plan[state.picker.day][state.picker.slot] = { mealId: meal.id, label: meal.name };
        savePlan(state.plan);
        state.picker = null;
        toast("Weekly plan updated");
        render();
      });
    });

    const submitOneOff = root.querySelector("[data-submit-one-off]");
    if (submitOneOff) {
      submitOneOff.addEventListener("click", () => {
        root.querySelector("[data-one-off]")?.requestSubmit();
      });
    }

    const oneOff = root.querySelector("[data-one-off]");
    if (oneOff) {
      const oneOffInput = oneOff.querySelector('[name="oneOff"]');
      if (oneOffInput) {
        oneOffInput.addEventListener("input", () => {
          state.oneOff = oneOffInput.value;
        });
      }
      oneOff.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = String(new FormData(oneOff).get("oneOff") || "").trim();
        if (!value || !state.picker) return;
        state.plan[state.picker.day][state.picker.slot] = { mealId: null, label: value };
        savePlan(state.plan);
        state.picker = null;
        toast("Weekly plan updated");
        render();
      });
    }

    const clearSlot = root.querySelector("[data-clear-slot]");
    if (clearSlot) {
      clearSlot.addEventListener("click", () => {
        if (!state.picker) return;
        state.plan[state.picker.day][state.picker.slot] = { mealId: null, label: "" };
        savePlan(state.plan);
        state.picker = null;
        toast("Slot cleared");
        render();
      });
    }
  }

  function addGroceryItem() {
    const name = state.groceryDraft.trim();
    if (!name) return;
    let store = state.groceryStore;
    if (store === "__other") store = state.groceryStoreOther.trim();
    rememberCustomStore(store);
    state.grocery.items.push({
      id: `g-${Date.now()}`,
      name,
      checked: false,
      store,
    });
    state.groceryDraft = "";
    state.groceryStoreOther = "";
    saveGrocery(state.grocery);
    render();
  }

  function rememberCustomStore(store) {
    const name = (store || "").trim();
    if (!name) return;
    if (STORE_PRESETS.some((preset) => storeKey(preset) === storeKey(name))) return;
    if (state.grocery.customStores.some((item) => storeKey(item) === storeKey(name))) return;
    state.grocery.customStores.push(name);
  }

  function uniqueId(name) {
    const base = slugify(name) || "meal";
    let id = `user-${base}`;
    let n = 2;
    while (state.meals.some((meal) => meal.id === id)) {
      id = `user-${base}-${n}`;
      n += 1;
    }
    return id;
  }

  function mealMeta(meal) {
    const types = meal.types.map((type) => TYPE_LABEL[type]).join(" · ");
    return meal.makeAhead ? `${types} · Make-ahead` : types;
  }

  function dayLabel(id) {
    return DAYS.find((day) => day.id === id)?.label || id;
  }

  window.addEventListener("hashchange", () => {
    parseHash();
    render();
  });

  parseHash();
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
