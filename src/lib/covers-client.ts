import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { COVER_BUCKET, coverPath } from "./covers";

/**
 * Short-lived signed URLs for the saved photos. The bucket is private, so the
 * card grid can only show a photo the signed-in user is allowed to read.
 */
export function useCoverUrls(paths: (string | null | undefined)[]) {
  const key = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  return useQuery({
    queryKey: ["covers", key],
    enabled: key.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(COVER_BUCKET).createSignedUrls(key, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d, i) => {
        const k = key[i];
        if (d?.signedUrl && k) map[k] = d.signedUrl;
      });
      return map;
    },
  });
}

/** Save a photo for a project, replacing any previous one. */
export async function uploadCover(orgId: string, projectId: string, file: File) {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const path = coverPath(orgId, projectId, ext);
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  const { error: dbError } = await supabase
    .from("projects")
    .update({ cover_image_url: path, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (dbError) throw dbError;
  return path;
}
