import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MapIcon } from "../maps/types.js";

/** Size of a node's illustration on the card; the artwork is 328 x 258. */
export const mapSpotSize = {
  width: 168,
  height: 132,
};

const cache = new Map<string, string>();

/** Base64 of the bundled lossless WebP spot for each icon in use. Only these travel in the publish snippet. */
export function mapSpotImages(icons: Iterable<MapIcon>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const icon of new Set(icons)) {
    let data = cache.get(icon);
    if (data === undefined) {
      data = readFileSync(
        fileURLToPath(new URL(`../../assets/map-spots/${icon}.webp`, import.meta.url)),
      ).toString("base64");
      cache.set(icon, data);
    }
    result[icon] = data;
  }
  return result;
}
