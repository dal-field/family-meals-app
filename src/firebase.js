import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyD3iDTvzWy2Qay3qAoZmo1JLG7ivNMxqPk",
  authDomain: "littlefield-family-meals-e9caf.firebaseapp.com",
  projectId: "littlefield-family-meals-e9caf",
  storageBucket: "littlefield-family-meals-e9caf.firebasestorage.app",
  messagingSenderId: "197864844097",
  appId: "1:197864844097:web:0954157e32b72a4de28fc0",
  measurementId: "G-BBFS8XPV3B",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export async function signInFamily() {
  if (auth.currentUser) return auth.currentUser;
  const result = await signInAnonymously(auth);
  return result.user;
}

function householdRef(code) {
  return doc(db, "households", code);
}

export async function householdExists(code) {
  const snap = await getDoc(householdRef(code));
  return snap.exists();
}

export async function createHousehold(code) {
  await setDoc(householdRef(code), { createdAt: Date.now() }, { merge: true });
}

export async function writeHouseholdMeal(code, meal) {
  await setDoc(doc(db, "households", code, "meals", meal.id), meal);
}

export async function deleteHouseholdMeal(code, mealId) {
  await deleteDoc(doc(db, "households", code, "meals", mealId));
}

export async function writeHouseholdPlan(code, weekdays) {
  await setDoc(doc(db, "households", code, "plan", "week"), { weekdays, updatedAt: Date.now() });
}

export async function writeHouseholdStore(code, store) {
  await setDoc(doc(db, "households", code, "stores", store.id), store);
}

export async function deleteHouseholdStore(code, storeId) {
  await deleteDoc(doc(db, "households", code, "stores", storeId));
}

export async function loadHousehold(code) {
  const [mealsSnap, planSnap, storesSnap] = await Promise.all([
    getDocs(collection(db, "households", code, "meals")),
    getDoc(doc(db, "households", code, "plan", "week")),
    getDocs(collection(db, "households", code, "stores")),
  ]);
  return {
    meals: mealsSnap.docs.map((item) => item.data()),
    weekdays: planSnap.exists() ? planSnap.data().weekdays : null,
    stores: storesSnap.docs.map((item) => item.data()),
  };
}

export function listenHousehold(code, { onMeals, onPlan, onStores }) {
  const unsubMeals = onSnapshot(collection(db, "households", code, "meals"), (snap) => {
    onMeals(snap.docs.map((item) => item.data()));
  });
  const unsubPlan = onSnapshot(doc(db, "households", code, "plan", "week"), (snap) => {
    onPlan(snap.exists() ? snap.data().weekdays : null);
  });
  const unsubStores = onSnapshot(collection(db, "households", code, "stores"), (snap) => {
    onStores(snap.docs.map((item) => item.data()));
  });
  return () => {
    unsubMeals();
    unsubPlan();
    unsubStores();
  };
}
