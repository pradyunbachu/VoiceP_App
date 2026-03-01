import heic2any from "heic2any";

export function isHeicFile(file: File): boolean {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  const name = file.name?.toLowerCase() || "";
  return name.endsWith(".heic") || name.endsWith(".heif");
}

export async function convertHeicToJpeg(file: File): Promise<string> {
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const resultBlob = Array.isArray(blob) ? blob[0] : blob;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read converted HEIC file"));
    reader.readAsDataURL(resultBlob);
  });
}

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export function compressImage(dataUrl: string, { maxWidth = 1500, maxHeight = 2000, quality = 0.8 }: CompressOptions = {}): Promise<string> {
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
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
