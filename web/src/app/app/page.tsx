import { redirect } from "next/navigation";

/**
 * The dashboard is gone.
 *
 * It restated the marketing page to people who had already signed up and
 * buried the two things they came for. Home does that job now, so this route
 * only forwards: old links, bookmarks, and post-sign-in redirects all still
 * land somewhere sensible.
 */
export default function AppHomePage() {
  redirect("/");
}
