import type { Metadata } from "next";
import ActivityFeed from "@/components/activity-feed";

export const metadata: Metadata = {
  title: "Activity — through",
  description: "Review account access and sign-in activity in your workspace.",
  robots: { index: false, follow: false },
};
export default function ActivityPage() { return <ActivityFeed />; }
