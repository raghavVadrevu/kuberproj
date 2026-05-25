/** Target size after compression; uploads must not exceed this. */
export const AVATAR_TARGET_BYTES = 2 * 1024 * 1024

/** Reject originals above this to avoid browser memory issues. */
export const AVATAR_INPUT_MAX_BYTES = 30 * 1024 * 1024

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this image.'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

/**
 * If the file is larger than `maxBytes`, resize and re-encode until it fits (or best effort).
 */
export async function compressAvatarToMaxBytes(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file

  const img = await loadImageElement(file)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process this image.')

  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar'

  let maxDim = 2048
  let quality = 0.9
  let bestBlob: Blob | null = null

  for (let attempt = 0; attempt < 24; attempt++) {
    const w = img.naturalWidth
    const h = img.naturalHeight
    const scale = Math.min(1, maxDim / Math.max(w, h, 1))
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob =
      mime === 'image/jpeg'
        ? await canvasToBlob(canvas, mime, quality)
        : await canvasToBlob(canvas, mime, 1)
    if (!blob) break

    if (blob.size <= maxBytes) {
      return new File([blob], `${baseName}.${ext}`, { type: mime, lastModified: Date.now() })
    }

    bestBlob = !bestBlob || blob.size < bestBlob.size ? blob : bestBlob

    if (mime === 'image/jpeg' && quality > 0.45) {
      quality -= 0.08
    } else {
      maxDim = Math.floor(maxDim * 0.82)
      quality = 0.88
    }
  }

  if (bestBlob) {
    return new File([bestBlob], `${baseName}.${ext}`, { type: mime, lastModified: Date.now() })
  }

  throw new Error('Could not compress this image enough. Try a smaller photo.')
}
