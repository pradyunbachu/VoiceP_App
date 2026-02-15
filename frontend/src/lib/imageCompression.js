import heic2any from "heic2any";

/**
 * Check if a file is HEIC/HEIF format.
 */
export function isHeicFile(file) {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  const name = file.name?.toLowerCase() || "";
  return name.endsWith(".heic") || name.endsWith(".heif");
}

/**
 * Convert a HEIC/HEIF File or Blob to a JPEG data URL.
 */
export async function convertHeicToJpeg(file) {
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const resultBlob = Array.isArray(blob) ? blob[0] : blob;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read converted HEIC file"));
    reader.readAsDataURL(resultBlob);
  });
}

/**
 * Compress an image data URL to a smaller JPEG.
 */
export function compressImage(dataUrl, { maxWidth = 1500, maxHeight = 2000, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
