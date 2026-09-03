# Family Meals

A phone-first, no-login meal planner for the Littlefields. Plan the week, keep the family recipe list, check off midweek buys, and add meals on the phone — even in the kitchen.

**Live app:** [https://dal-field.github.io/family-meals-app/](https://dal-field.github.io/family-meals-app/)

**Repo:** [https://github.com/dal-field/family-meals-app](https://github.com/dal-field/family-meals-app)

No accounts. No backend. Changes stay on the device in `localStorage` and are merged with the baked-in food list so seed recipes are never lost.

## What a parent can do

- **This Week** — breakfast, lunch, dinner, and snack for all 7 days. Tonight’s dinner is at the top. Tap any slot to pick a library meal or type a one-off.
- **Meals** — searchable library, filter by Breakfast / Lunch / Dinner / Snack / Make-ahead. Open a meal for notes and recipe links (links open in a new tab).
- **Add** — save a new meal (name, types, notes, recipe URL, ingredients, make-ahead). Edit later. Delete meals you added; hide a baked-in seed meal if you do not want it in the list.
- **Groceries** — midweek buy list (salad kit, chicken for Thu/Sun, cantaloupe) plus a simple extra list you can check off and add to.

Install from the browser (“Add to Home Screen”) for a full-screen PWA. After the first visit it works offline.

## How to add a meal

1. Open **Add**.
2. Type a name (required).
3. Tap one or more meal types.
4. Optionally add notes, a recipe link, ingredients, and Make-ahead.
5. Tap **Save meal**.

It shows up under **Meals** right away and is still there after refresh.

## Seeded from the Food spreadsheet

- The weekly plan (Mon–Sun, all four slots, including empty Saturday/Sunday snacks).
- Dinner ideas (one meal each; shared names such as Spaghetti, Burritos, Beef stroganoff, and Chicken pillows are a single meal used in both the plan and the library).
- Make-ahead breakfasts: Burritos, Sandwiches, Boiled eggs & smoothies, Crepes.
- Midweek buy: Salad kit, Chicken (Th, Sun), Cantaloupe.
- Recipe URLs for Taquitos and Chicken Alfredo.

## Local development

```bash
npm install
npm run dev
```

The Vite base path is `/family-meals-app/`, so the app is at `http://localhost:5173/family-meals-app/`.

```bash
npm run build
npm run preview
```

## Deploy

Every push to `main` builds the static site and deploys it with GitHub Actions to GitHub Pages (`/family-meals-app/`).

If the live URL 404s after a green Actions run, enable Pages once:

1. Open **https://github.com/dal-field/family-meals-app/settings/pages**
2. Under **Build and deployment → Source**, choose **GitHub Actions**
3. If asked, approve the **github-pages** environment at **https://github.com/dal-field/family-meals-app/settings/environments**

The deploy workflow also sets `enablement: true` on `actions/configure-pages` so the first Actions run can turn Pages on by itself when the token allows it.
