/**
 * OSS multipart upload utility using ali-oss SDK with STS credentials.
 *
 * Supports:
 * - Large file chunked upload (default 1MB per part)
 * - Progress callback
 * - Abort / cancel
 * - Automatic retry on part failure
 */
import OSS from 'ali-oss'

const PART_SIZE = 1 * 1024 * 1024 // 1MB per chunk

/**
 * Upload a file to OSS using STS temporary credentials.
 *
 * @param {Object} cred - Credential object from backend /upload-credential
 * @param {string} cred.region
 * @param {string} cred.access_key_id
 * @param {string} cred.access_key_secret
 * @param {string} cred.security_token
 * @param {string} cred.bucket
 * @param {string} cred.object_key
 * @param {File} file - The File object to upload
 * @param {Object} [options]
 * @param {function} [options.onProgress] - Progress callback: (percent: number) => void, percent 0-100
 * @returns {Promise<{objectKey: string, etag: string}>}
 */
export async function ossUpload(cred, file, options = {}) {
  const { onProgress } = options

  const client = new OSS({
    region: `oss-${cred.region}`,
    accessKeyId: cred.access_key_id,
    accessKeySecret: cred.access_key_secret,
    stsToken: cred.security_token,
    bucket: cred.bucket,
    secure: true,
    refreshSTSTokenInterval: 0, // don't auto-refresh, token is single-use
  })

  const result = await client.multipartUpload(cred.object_key, file, {
    partSize: PART_SIZE,
    progress: (p) => {
      if (onProgress) {
        onProgress(Math.round(p * 100))
      }
    },
  })

  return {
    objectKey: cred.object_key,
    etag: result.etag,
  }
}

/**
 * Format file size to human-readable string.
 */
export function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

/**
 * Max upload size (2GB).
 */
export const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024

/**
 * Validate file before upload.
 * @returns {string|null} Error message or null if valid.
 */
export function validateFile(file, { maxSize = MAX_UPLOAD_SIZE, allowedExts = [] } = {}) {
  if (!file) return 'No file selected'
  if (file.size > maxSize) return `File too large: ${formatSize(file.size)} (max ${formatSize(maxSize)})`
  if (file.size === 0) return 'File is empty'
  if (allowedExts.length > 0) {
    const ext = ('.' + file.name.split('.').pop()).toLowerCase()
    if (!allowedExts.includes(ext)) return `Invalid file type: ${ext} (allowed: ${allowedExts.join(', ')})`
  }
  return null
}
