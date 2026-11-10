// Chart pictures are part of a Haul: when its bundle is fetched they are downloaded next to it in the
// document directory, so a chart reads offline like the rest of the Haul. Kept under the bundle's
// hauls__ prefix (lib/chart.ts), so Settings counts them and "Remove downloads" clears them. A data
// story's plate pictures are kept the same way, under its data__ prefix (lib/atlas.ts). Every
// step is best effort: a failed download or a full disk leaves the remote picture, never a broken page.

import { File, Paths } from 'expo-file-system';
import type { Haul } from '@fdf/shared/haul';
import type { PublishedStory } from '@fdf/shared/stories/published';
import { chartPictureUrls, pictureFileName } from './chart';
import { storyPictureFileName, storyPictureUrls } from './atlas';

const inflight = new Set<string>();

const fileOf = (url: string): File | null => {
  const name = pictureFileName(url) ?? storyPictureFileName(url);
  return name ? new File(Paths.document, name) : null;
};

/** The picture's address to show: the copy on the phone when there is one, else the published file. */
export function pictureUri(url: string): string {
  try {
    const f = fileOf(url);
    if (f?.exists) return f.uri;
  } catch {
    // Unreadable storage: show the published file.
  }
  return url;
}

/** Download a Haul's chart pictures that are not on the phone yet (in the background). */
export function keepPictures(haul: Pick<Haul, 'items'> | null | undefined): void {
  if (haul?.items) keep(chartPictureUrls(haul));
}

/** Download a data story's plate pictures that are not on the phone yet (in the background). */
export function keepStoryPictures(story: PublishedStory | null | undefined): void {
  if (story) keep(storyPictureUrls(story));
}

function keep(urls: string[]): void {
  for (const url of urls) {
    if (inflight.has(url)) continue;
    let f: File | null = null;
    try {
      f = fileOf(url);
      if (!f || f.exists) continue;
    } catch {
      continue;
    }
    inflight.add(url);
    File.downloadFileAsync(url, f)
      .catch(() => {
        // Offline or refused: the picture loads from the files host next time, or the table stands in.
        try {
          if (f?.exists) f.delete();
        } catch {
          // Best effort.
        }
      })
      .finally(() => inflight.delete(url));
  }
}
