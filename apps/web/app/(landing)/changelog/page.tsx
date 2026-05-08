import type { Metadata } from "next";
import { ChangelogPageClient } from "@/features/landing/components/changelog-page-client";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "See what's new in Multicacan — latest features, improvements, and fixes.",
  openGraph: {
    title: "Changelog | Multicacan",
    description: "Latest updates and releases from Multicacan.",
    url: "/changelog",
  },
  alternates: {
    canonical: "/changelog",
  },
};

export default function ChangelogPage() {
  return <ChangelogPageClient />;
}
