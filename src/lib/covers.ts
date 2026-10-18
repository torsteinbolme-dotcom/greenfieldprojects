import defaultCover from "@/assets/covers/default.jpg.asset.json";

/** Private storage bucket holding one photo per project. */
export const COVER_BUCKET = "project-covers";

/** Neutral mountain photo shown on cards until a project gets its own photo. */
export const DEFAULT_COVER_URL = defaultCover.url;

const ALLOWED = ["jpg", "jpeg", "png", "webp", "gif"];

/**
 * Storage object path for a project's own photo: `<organization>/<project>.<ext>`.
 * The organisation folder is the first path segment so the access rules on the
 * bucket can check membership straight from the file name.
 */
export function coverPath(orgId: string, projectId: string, ext = "jpg") {
  const clean = String(ext).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${orgId}/${projectId}.${ALLOWED.includes(clean) ? clean : "jpg"}`;
}

/**
 * Image source for a card: the project's own photo (signed for display) or the
 * shared placeholder when none is saved or the signature is missing.
 */
export function coverSrc(project: { cover_image_url: string | null }, signed: Record<string, string>) {
  const path = project.cover_image_url;
  return (path && signed[path]) || DEFAULT_COVER_URL;
}
