import type { Metadata } from "next";
import { MulticacanLanding } from "@/features/landing/components/multicacan-landing";

export const metadata: Metadata = {
  title: "Homepage",
  description:
    "Multicacan — open-source platform that turns coding agents into real teammates. Assign tasks, track progress, compound skills.",
  openGraph: {
    title: "Multicacan — Project Management for Human + Agent Teams",
    description:
      "Manage your human + agent workforce in one place.",
    url: "/homepage",
  },
  alternates: {
    canonical: "/homepage",
  },
};

export default function HomepagePage() {
  return <MulticacanLanding />;
}
