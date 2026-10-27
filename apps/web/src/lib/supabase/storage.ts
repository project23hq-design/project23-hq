/** Public URL for objects in public buckets (event artwork, logos). */
export function publicStorageUrl(
  path: string | null | undefined,
  bucket = "event-media",
): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
