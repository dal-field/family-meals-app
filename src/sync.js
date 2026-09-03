import {
  generateFamilyCode,
  isFamilyCode,
  mealsForUpload,
  mergeLocalOnlyMeals,
  normalizeFamilyCode,
} from "./family.js";
import {
  createHousehold,
  deleteHouseholdMeal,
  deleteHouseholdStore,
  householdExists,
  listenHousehold,
  loadHousehold,
  signInFamily,
  writeHouseholdMeal,
  writeHouseholdPlan,
  writeHouseholdStore,
} from "./firebase.js";
import {
  dataUrlToRecord,
  deleteMealPhoto,
  listMealPhotos,
  photoToSyncFields,
  putMealPhoto,
} from "./photos.js";
import {
  applyRemoteGrocery,
  applyRemoteMeals,
  applyRemotePlan,
  exportHiddenSeedIds,
  exportSyncMeals,
  loadFamilyCode,
  loadGrocery,
  loadPlan,
  saveFamilyCode,
} from "./storage.js";

let unsubscribe = null;
let pushing = false;
let applying = false;
let started = false;
let syncGeneration = 0;
let lastStoreIds = [];

function onRemote(handler) {
  if (typeof handler === "function") handler();
}

async function attachPhotos(meals) {
  const photos = new Map();
  try {
    for (const record of await listMealPhotos()) {
      if (record?.id) photos.set(record.id, record);
    }
  } catch {
    return meals;
  }
  return Promise.all(
    meals.map(async (meal) => {
      const record = photos.get(meal.id);
      if (!record) return { ...meal, photo: "", photoThumb: "", photoMime: "", photoWidth: 0, photoHeight: 0 };
      return { ...meal, ...(await photoToSyncFields(record)) };
    })
  );
}

async function applyMealPhotos(meals) {
  for (const meal of meals) {
    if (!meal?.id) continue;
    if (meal.photo) {
      const thumb = meal.photoThumb ? await dataUrlToRecord(meal.photoThumb) : null;
      const record = await dataUrlToRecord(meal.photo, {
        thumbBlob: thumb?.blob,
        mime: meal.photoMime,
        width: meal.photoWidth,
        height: meal.photoHeight,
      });
      if (record) await putMealPhoto(meal.id, record);
    } else {
      await deleteMealPhoto(meal.id).catch(() => undefined);
    }
  }
}

async function pushMealDocs(code, meals) {
  const docs = await attachPhotos(mealsForUpload(meals, exportHiddenSeedIds()));
  await Promise.all(docs.map((meal) => writeHouseholdMeal(code, meal)));
}

async function pushPlan(code) {
  await writeHouseholdPlan(code, loadPlan().weekdays);
}

async function pushStores(code, previousIds = []) {
  const stores = loadGrocery().stores || [];
  const nextIds = new Set(stores.map((store) => store.id));
  await Promise.all(stores.map((store) => writeHouseholdStore(code, store)));
  await Promise.all(previousIds.filter((id) => !nextIds.has(id)).map((id) => deleteHouseholdStore(code, id)));
  return [...nextIds];
}

export function ensureLocalFamilyCode() {
  let code = loadFamilyCode();
  if (isFamilyCode(code)) return code;
  code = generateFamilyCode();
  saveFamilyCode(code);
  return code;
}

export function currentFamilyCode() {
  return loadFamilyCode() || ensureLocalFamilyCode();
}

export async function uploadLocalHousehold(code, meals = exportSyncMeals()) {
  await createHousehold(code);
  const remote = await loadHousehold(code).catch(() => ({ meals: [], stores: [] }));
  await pushMealDocs(code, meals);
  const uploadedIds = new Set(mealsForUpload(meals, exportHiddenSeedIds()).map((meal) => meal.id));
  await Promise.all(
    (remote.meals || [])
      .filter((meal) => meal?.id && !uploadedIds.has(meal.id))
      .map((meal) => deleteHouseholdMeal(code, meal.id))
  );
  await pushPlan(code);
  lastStoreIds = await pushStores(
    code,
    (remote.stores || []).map((store) => store.id)
  );
}

export async function applyHouseholdSnapshot(remote, { mergeLocalMeals = false } = {}) {
  applying = true;
  try {
    const localMeals = exportSyncMeals();
    const meals = mergeLocalMeals ? mergeLocalOnlyMeals(remote.meals || [], localMeals) : remote.meals || localMeals;
    if (Array.isArray(remote.meals)) {
      applyRemoteMeals(meals);
      await applyMealPhotos(meals);
    }
    if (remote.weekdays) applyRemotePlan(remote.weekdays);
    if (Array.isArray(remote.stores)) applyRemoteGrocery(remote.stores);
    return meals;
  } finally {
    applying = false;
  }
}

export async function pushLocalChanges() {
  const code = loadFamilyCode();
  if (!code || pushing || applying) return;
  pushing = true;
  try {
    await uploadLocalHousehold(code);
  } catch {
    /* offline cache still holds the latest write */
  } finally {
    pushing = false;
  }
}

export async function pushMealChange(meal) {
  const code = loadFamilyCode();
  if (!code || !meal?.id || applying) return;
  pushing = true;
  try {
    const [doc] = await attachPhotos(mealsForUpload([meal], exportHiddenSeedIds()));
    await writeHouseholdMeal(code, doc);
  } catch {
    /* offline cache still holds the latest write */
  } finally {
    pushing = false;
  }
}

export async function pushPlanChange() {
  const code = loadFamilyCode();
  if (!code || applying) return;
  pushing = true;
  try {
    await createHousehold(code);
    await pushPlan(code);
  } catch {
    /* offline cache still holds the latest write */
  } finally {
    pushing = false;
  }
}

export async function pushGroceryChange() {
  const code = loadFamilyCode();
  if (!code || applying) return;
  pushing = true;
  try {
    lastStoreIds = await pushStores(code, lastStoreIds);
  } catch {
    /* offline cache still holds the latest write */
  } finally {
    pushing = false;
  }
}

export async function removeRemoteMeal(mealId) {
  const code = loadFamilyCode();
  if (!code || !mealId) return;
  try {
    await deleteHouseholdMeal(code, mealId);
    await deleteMealPhoto(mealId);
  } catch {
    await deleteMealPhoto(mealId).catch(() => undefined);
  }
}

export function stopFamilySync() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export async function startFamilySync(handler) {
  if (started) return loadFamilyCode();
  started = true;
  const gen = ++syncGeneration;
  try {
    await signInFamily();
    if (gen !== syncGeneration) return loadFamilyCode();
    const code = ensureLocalFamilyCode();
    if (await householdExists(code)) {
      if (gen !== syncGeneration) return loadFamilyCode();
      const remote = await loadHousehold(code);
      if (gen !== syncGeneration) return loadFamilyCode();
      await applyHouseholdSnapshot(remote, { mergeLocalMeals: true });
      lastStoreIds = (remote.stores || []).map((store) => store.id);
    }
    if (gen !== syncGeneration) return loadFamilyCode();
    await uploadLocalHousehold(code, exportSyncMeals());
    if (gen !== syncGeneration) return loadFamilyCode();

    stopFamilySync();
    unsubscribe = listenHousehold(code, {
      onMeals: async (meals) => {
        if (gen !== syncGeneration || applying || pushing || !meals.length) return;
        await applyHouseholdSnapshot({ meals }, { mergeLocalMeals: false });
        onRemote(handler);
      },
      onPlan: (weekdays) => {
        if (gen !== syncGeneration || applying || pushing || !weekdays) return;
        applyHouseholdSnapshot({ weekdays });
        onRemote(handler);
      },
      onStores: (stores) => {
        if (gen !== syncGeneration || applying || pushing) return;
        lastStoreIds = (stores || []).map((store) => store.id);
        applyHouseholdSnapshot({ stores });
        onRemote(handler);
      },
    });
    onRemote(handler);
    return code;
  } catch (error) {
    if (gen === syncGeneration) started = false;
    throw error;
  }
}

export async function joinFamily(rawCode, handler) {
  const code = normalizeFamilyCode(rawCode);
  if (!isFamilyCode(code)) throw new Error("Type the 6-character family code");
  syncGeneration += 1;
  started = false;
  stopFamilySync();
  await signInFamily();
  if (!(await householdExists(code))) throw new Error("That family code was not found");
  const localMeals = exportSyncMeals();
  const remote = await loadHousehold(code);
  const merged = mergeLocalOnlyMeals(remote.meals || [], localMeals);
  saveFamilyCode(code);
  applying = true;
  try {
    applyRemoteMeals(merged);
    await applyMealPhotos(merged);
    if (remote.weekdays) applyRemotePlan(remote.weekdays);
    if (Array.isArray(remote.stores)) applyRemoteGrocery(remote.stores);
    lastStoreIds = (remote.stores || []).map((store) => store.id);
  } finally {
    applying = false;
  }
  await uploadLocalHousehold(code, merged);
  await startFamilySync(handler);
  return code;
}
