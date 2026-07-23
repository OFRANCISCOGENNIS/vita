// Helpers for the "Compartilhar corte" feature. Builds an absolute URL to the
// cut's editor page (there is no public cut page) and a share caption. Guards
// SSR — window/origin are only read in the browser.

import type { Cut } from "./types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Absolute URL to open a cut in the editor. */
export function cutShareUrl(cutId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://ofranciscogennis.github.io";
  return `${origin}${BASE_PATH}/app/editor?cut=${cutId}`;
}

/** Share caption: title + hashtags. */
export function buildShareText(cut: Pick<Cut, "title" | "hashtags">): string {
  const tags = cut.hashtags.join(" ");
  return tags ? `${cut.title} ${tags}` : cut.title;
}
