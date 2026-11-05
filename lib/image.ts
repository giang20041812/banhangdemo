/** Thu nhỏ ảnh (ảnh chụp từ điện thoại thường 3–10 MB) về JPEG tối đa `max` px mỗi cạnh. Chỉ chạy ở client. */
export async function shrinkImage(file: File, max = 1024, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn một tệp ảnh.')
  // imageOrientation: tôn trọng hướng xoay EXIF của ảnh chụp bằng điện thoại
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // PNG trong suốt -> nền trắng khi sang JPEG
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không xử lý được ảnh này.'))), 'image/jpeg', quality),
  )
}

export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Không đọc được ảnh.'))
    r.readAsDataURL(b)
  })
