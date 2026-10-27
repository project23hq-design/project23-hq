import type { Metadata } from "next";
import { ExploreView } from "@/components/explore-view";

export const metadata: Metadata = {
  title: "Discover events",
  alternates: { canonical: "/explore" },
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ExploreView sp={await searchParams} />;
}
