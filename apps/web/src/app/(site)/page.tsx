import { ExploreView } from "@/components/explore-view";

export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ExploreView sp={await searchParams} />;
}
