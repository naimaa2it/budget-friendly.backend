import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// All uploaded files live under <backend>/public/uploads, served statically
// at /uploads by index.js. Deployment is `git pull` on the VPS, so this
// directory is gitignored — files persist across pulls as long as nothing
// runs `git clean`.
export const UPLOADS_ROOT = path.join(__dirname, "..", "public", "uploads");

const PUBLIC_BASE_URL = (
  process.env.BACKEND_URL || "https://api.pickob.com"
).replace(/\/+$/, "");

const EXT_BY_MIME = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function extForMime(mimetype, fallback = "bin") {
  return EXT_BY_MIME[mimetype] || fallback;
}

// Cloudinary "folder" params were things like "Pickob/products" — keep the
// same string as the on-disk subfolder so existing folder args stay
// meaningful. Strips traversal and anything outside a safe charset.
function sanitizeFolder(folder) {
  const cleaned = String(folder || "misc")
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
  return cleaned || "misc";
}

// Writes a buffer under UPLOADS_ROOT/<folder>/ and returns the same
// { public_id, url } shape the Cloidinary path used to return, so callers
// (product/category/banner image schemas etc.) don't need to change.
// public_id keeps its file extension — that's how deleteLocalImage() and
// isLocalPublicId() tell a local asset apart from a legacy Cloudinary one
// (Cloudinary public_ids never carry an extension).
export function saveLocalImage(buffer, folder, ext = "webp") {
  const safeFolder = sanitizeFolder(folder);
  const dir = path.join(UPLOADS_ROOT, safeFolder);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  const public_id = `${safeFolder}/${filename}`;
  return { public_id, url: `${PUBLIC_BASE_URL}/uploads/${public_id}` };
}

// Shared pipeline used by every upload route (admin/user/products): resizes +
// re-encodes photos to webp, passes videos through untouched, and — like the
// frontend's compressImage() — leaves GIFs untouched too, since sharp's
// default (non-animated) webp() would flatten an animated GIF to one frame.
// Throws if the buffer isn't a decodable image (caller should turn that into
// a 400).
export async function processAndSaveImage(buffer, mimetype, folder) {
  const isVideo = String(mimetype || "").startsWith("video/");
  if (isVideo) {
    const ext = extForMime(mimetype, "mp4");
    const { public_id, url } = saveLocalImage(buffer, folder, ext);
    return { public_id, url, format: ext, resourceType: "video" };
  }

  if (mimetype === "image/gif") {
    let meta = {};
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      // non-fatal — width/height just won't be in the response
    }
    const { public_id, url } = saveLocalImage(buffer, folder, "gif");
    return {
      public_id,
      url,
      width: meta.width,
      height: meta.height,
      format: "gif",
      resourceType: "image",
    };
  }

  const maxWidth = Number(process.env.IMG_MAX_WIDTH) || 1600;
  const quality = Number(process.env.IMG_QUALITY) || 75;
  const optimizedBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
  const meta = await sharp(optimizedBuffer).metadata();
  const { public_id, url } = saveLocalImage(optimizedBuffer, folder, "webp");
  return {
    public_id,
    url,
    width: meta.width,
    height: meta.height,
    format: "webp",
    resourceType: "image",
  };
}

export function isLocalPublicId(publicId) {
  return /\.(webp|jpe?g|png|gif|avif|mp4|webm|mov)$/i.test(
    String(publicId || ""),
  );
}

export function deleteLocalImage(publicId) {
  if (!publicId) return;
  const normalized = path
    .normalize(String(publicId))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(UPLOADS_ROOT, normalized);
  if (!filePath.startsWith(UPLOADS_ROOT)) return; // path traversal guard
  fs.unlink(filePath, () => {});
}

// Single entry point for asset cleanup: routes past product/category/etc.
// deletes should call this instead of cloudinary.uploader.destroy directly,
// so old (Cloudinary) and new (local) assets both get cleaned up correctly.
export async function deleteImageAsset(publicId, cloudinaryDestroy) {
  if (!publicId) return;
  if (isLocalPublicId(publicId)) {
    deleteLocalImage(publicId);
    return;
  }
  try {
    await cloudinaryDestroy(publicId, { resource_type: "image" });
  } catch {
    // ignore Cloudinary errors, same as before
  }
}

const VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);

// Backs the admin Media Library "Cloudinary" listing — walks public/uploads
// (optionally scoped to `folder`) and returns the same item shape the
// Cloudinary resources() listing produces, so the frontend can merge both
// sources transparently. No cursor/pagination (folders are small); capped at
// `limit` files.
export function listLocalImages({ folder = "", q = "", limit = 300 } = {}) {
  const safeFolder = folder ? sanitizeFolder(folder) : "";
  const startDir = path.join(UPLOADS_ROOT, safeFolder);
  const relPaths = [];

  const walk = (dir, relPrefix) => {
    if (relPaths.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (relPaths.length >= limit) return;
      if (entry.name === ".gitkeep") continue;
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile() && isLocalPublicId(entry.name)) {
        relPaths.push(rel);
      }
    }
  };
  walk(startDir, safeFolder);

  const lowerQ = q.toLowerCase();
  return relPaths
    .filter((rel) => !lowerQ || rel.toLowerCase().includes(lowerQ))
    .map((public_id) => {
      const stat = fs.statSync(path.join(UPLOADS_ROOT, public_id));
      const ext = path.extname(public_id).slice(1).toLowerCase();
      return {
        public_id,
        url: `${PUBLIC_BASE_URL}/uploads/${public_id}`,
        resource_type: VIDEO_EXTS.has(ext) ? "video" : "image",
        bytes: stat.size,
        format: ext,
        created_at: (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString(),
        folder: public_id.split("/").slice(0, -1).join("/"),
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Every subfolder under public/uploads that directly contains at least one
// file — feeds the admin Media Library folder dropdown alongside Cloudinary's
// root_folders().
export function listLocalFolders() {
  const folders = new Set();
  const walk = (dir, relPrefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    let hasFile = false;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile() && entry.name !== ".gitkeep") {
        hasFile = true;
      }
    }
    if (hasFile && relPrefix) folders.add(relPrefix);
  };
  walk(UPLOADS_ROOT, "");
  return [...folders].sort();
}
