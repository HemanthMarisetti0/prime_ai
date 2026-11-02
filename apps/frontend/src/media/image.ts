import type { ChatImageMimeType } from '@prime/shared';

/** An image ready to send: base64 data for the API plus a data URL for previews. */
export interface AttachedImage {
  mimeType: ChatImageMimeType;
  data: string;
  previewUrl: string;
}

// Big enough to read screenshots, small enough to keep requests quick.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image, Sir.'));
    };
    img.src = url;
  });
}

function toAttachedImage(canvas: HTMLCanvasElement): AttachedImage {
  const previewUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { mimeType: 'image/jpeg', data: previewUrl.slice(previewUrl.indexOf(',') + 1), previewUrl };
}

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // flatten transparency for JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Downscales and re-encodes an image file/blob as JPEG. */
export async function prepareImage(blob: Blob): Promise<AttachedImage> {
  if (!blob.type.startsWith('image/')) throw new Error('Only images can be attached, Sir.');
  if (blob.size > MAX_INPUT_BYTES) throw new Error('That image is too large, Sir. Please choose one under 25 MB.');
  const img = await loadImage(blob);
  return toAttachedImage(drawScaled(img, img.naturalWidth, img.naturalHeight));
}

export const canCaptureScreen = () => typeof navigator.mediaDevices?.getDisplayMedia === 'function';

/** Asks the browser to share a screen or window, grabs one frame, then stops sharing. */
export async function captureScreen(): Promise<AttachedImage> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // Give the first frame a moment to render.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return toAttachedImage(drawScaled(video, video.videoWidth, video.videoHeight));
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
