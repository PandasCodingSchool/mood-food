// Wall photo storage adapter — single swap point for real S3/Cloudinary code.
//
// The Wall feature ships wired-but-locked in v1: no bucket is configured yet,
// so uploadWallPhoto always throws until WALL_PHOTO_BUCKET (or an equivalent
// storage env var) is set. Adding real storage later is a config change here,
// not a change to any caller — routes/diy.js already treats "not configured"
// as a clean, expected state (locked wall UI), not an error path.

export function isPhotoStorageConfigured() {
  return Boolean(process.env.WALL_PHOTO_BUCKET);
}

/**
 * Upload a wall photo and return its public URL.
 * @param {Buffer} _buffer - raw image bytes
 * @param {string} _userId
 * @param {string} _sessionId - diy_sessions.id this photo belongs to
 * @returns {Promise<string>} the stored photo's URL
 */
export async function uploadWallPhoto(_buffer, _userId, _sessionId) {
  if (!isPhotoStorageConfigured()) {
    throw new Error("Wall photo storage not configured");
  }
  // TODO: once WALL_PHOTO_BUCKET is set, implement the real upload here
  // (e.g. AWS S3 PutObjectCommand) and return the resulting public URL.
  throw new Error("Wall photo storage configured but upload not implemented");
}
