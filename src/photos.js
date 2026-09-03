const DB_NAME = "fm.mealPhotos";
const DB_VERSION = 1;
const STORE = "photos";

export function resolvedMealPhotoSrc(cached) {
  if (!cached || cached === "none") return "";
  return cached.thumbUrl || cached.url || "";
}

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

export const MAX_PHOTO_DATA_URL = 700 * 1024;

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read that photo"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToRecord(dataUrl, extra = {}) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return {
    blob,
    thumbBlob: extra.thumbBlob || blob,
    mime: extra.mime || blob.type || "image/jpeg",
    width: extra.width || 0,
    height: extra.height || 0,
    updatedAt: extra.updatedAt || Date.now(),
  };
}

export async function compressImageFile(file, { maxEdge = 1200, thumbEdge = 240, quality = 0.72 } = {}) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("That file is not a photo");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const fullSize = scaleSize(bitmap.width, bitmap.height, maxEdge);
    const thumbSize = scaleSize(bitmap.width, bitmap.height, thumbEdge);
    const mime = "image/jpeg";
    let nextQuality = quality;
    let outSize = fullSize;
    let blob = await canvasToBlob(drawScaled(bitmap, outSize.width, outSize.height), mime, nextQuality);
    while (blob.size * 1.37 > MAX_PHOTO_DATA_URL && nextQuality > 0.42) {
      nextQuality = Math.max(0.42, nextQuality - 0.12);
      outSize = scaleSize(bitmap.width, bitmap.height, nextQuality < 0.55 ? 960 : maxEdge);
      blob = await canvasToBlob(drawScaled(bitmap, outSize.width, outSize.height), mime, nextQuality);
    }
    const thumbBlob = await canvasToBlob(drawScaled(bitmap, thumbSize.width, thumbSize.height), mime, 0.68);
    return {
      blob,
      thumbBlob,
      mime,
      width: outSize.width,
      height: outSize.height,
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

export async function listMealPhotos() {
  const db = await openPhotoDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("Could not list photos"));
    });
  } finally {
    db.close();
  }
}

export async function photoToSyncFields(record) {
  if (!record?.blob) return { photo: "", photoThumb: "", photoMime: "", photoWidth: 0, photoHeight: 0 };
  let blob = record.blob;
  let width = record.width || 0;
  let height = record.height || 0;
  let dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > MAX_PHOTO_DATA_URL) {
    const file = new File([blob], "meal.jpg", { type: record.mime || blob.type || "image/jpeg" });
    const compressed = await compressImageFile(file, { maxEdge: 960, quality: 0.58 });
    blob = compressed.blob;
    width = compressed.width;
    height = compressed.height;
    dataUrl = await blobToDataUrl(blob);
  }
  if (dataUrl.length > MAX_PHOTO_DATA_URL) {
    return { photo: "", photoThumb: "", photoMime: "", photoWidth: 0, photoHeight: 0 };
  }
  return {
    photo: dataUrl,
    photoThumb: await blobToDataUrl(record.thumbBlob || blob),
    photoMime: record.mime || blob.type || "image/jpeg",
    photoWidth: width,
    photoHeight: height,
  };
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
