import { cache } from "react";
import type { PublicStatusPage } from "./types";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Server-side fetch of a published status page from the API (`BACKEND_URL`, never exposed to the browser).
 * Returns null for invalid slugs and unknown/unpublished pages, "unavailable" when the API cannot answer. `cache` dedupes the call
 * between generateMetadata and the page within one request; the response itself is never cached.
 */
export const getPublicStatusPage = cache(async (rawSlug: string): Promise<PublicStatusPage | null | "unavailable"> => {
  const slug = rawSlug.toLowerCase();
  if (slug.length < 3 || slug.length > 50 || !SLUG.test(slug)) return null;
  const base = process.env.BACKEND_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/public/status-pages/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) return "unavailable";
    const body = (await res.json()) as { data: PublicStatusPage };
    return body.data;
  } catch {
    return "unavailable";
  }
});
