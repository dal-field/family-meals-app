const DB_NAME = "fm.mealPhotos";
const DB_VERSION = 1;
const STORE = "photos";

export function scaleSize(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function openPhotoDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Photos are not available on this phone"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open photo storage"));
  });
}

function preferredMime() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not compress that photo"));
      },
      mime,
      quality
    );
  });
}

function drawScaled(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare that photo");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

export async function compressImageFile(file, { maxEdge = 1600, thumbEdge = 240, quality = 0.8 } = {}) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("That file is not a photo");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const fullSize = scaleSize(bitmap.width, bitmap.height, maxEdge);
    const thumbSize = scaleSize(bitmap.width, bitmap.height, thumbEdge);
    const mime = preferredMime();
    const blob = await canvasToBlob(drawScaled(bitmap, fullSize.width, fullSize.height), mime, quality);
    const thumbBlob = await canvasToBlob(drawScaled(bitmap, thumbSize.width, thumbSize.height), mime, 0.72);
    return {
      blob,
      thumbBlob,
      mime,
      width: fullSize.width,
      height: fullSize.height,
    };
  } finally {
    bitmap.close?.();
  }
}

export async function putMealPhoto(mealId, photo) {
  const db = await openPhotoDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not save the photo"));
      tx.objectStore(STORE).put({
        id: mealId,
        blob: photo.blob,
        thumbBlob: photo.thumbBlob || photo.blob,
        mime: photo.mime || photo.blob.type,
        width: photo.width || 0,
        height: photo.height || 0,
        updatedAt: Date.now(),
      });
    });
  } finally {
    db.close();
  }
}

export async function getMealPhoto(mealId) {
  const db = await openPhotoDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(mealId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not load the photo"));
    });
  } finally {
    db.close();
  }
}

export async function deleteMealPhoto(mealId) {
  const db = await openPhotoDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not remove the photo"));
      tx.objectStore(STORE).delete(mealId);
    });
  } finally {
    db.close();
  }
}
