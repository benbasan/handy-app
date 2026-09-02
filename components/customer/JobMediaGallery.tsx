import { signJobMedia } from "@/lib/supabase/jobs";

/**
 * The media attached to a job, rendered from short-lived signed URLs.
 *
 * Signing happens on the server, under the caller's own RLS: Storage will not
 * sign a path the caller cannot select, so a job's photos are unreachable to
 * anyone the policies exclude even if they somehow learned the path. Anything
 * that fails to sign is left out rather than rendered as a broken box.
 */
export async function JobMediaGallery({
  photoPaths,
  videoPath,
  voiceNotePath,
}: {
  photoPaths: string[];
  videoPath: string | null;
  voiceNotePath: string | null;
}) {
  const paths = [
    ...photoPaths,
    ...(videoPath ? [videoPath] : []),
    ...(voiceNotePath ? [voiceNotePath] : []),
  ];

  if (paths.length === 0) return null;

  const signed = await signJobMedia(paths);
  const photos = photoPaths
    .map((path) => signed.get(path))
    .filter((url): url is string => Boolean(url));
  const video = videoPath ? signed.get(videoPath) : undefined;
  const voice = voiceNotePath ? signed.get(voiceNotePath) : undefined;

  if (photos.length === 0 && !video && !voice) return null;

  return (
    <div className="mt-5 space-y-3">
      <h3 className="text-sm font-semibold text-ink">מדיה מצורפת</h3>

      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {photos.map((url) => (
            <li key={url}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed,
                  expiring Storage URL: next/image would cache a URL that dies. */}
              <img
                src={url}
                alt="תמונת התקלה שצורפה לקריאה"
                className="size-28 rounded-xl border border-line object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      {video && (
        <video controls src={video} className="w-full max-w-md rounded-xl" />
      )}

      {voice && <audio controls src={voice} className="w-full max-w-md" />}
    </div>
  );
}
