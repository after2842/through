import type { Metadata } from "next";
import PricingContent from "@/components/pricing-content";

export const metadata: Metadata = {
  title: "Pricing — through",
  description: "Personal, Team, and Enterprise plans are $0 during the through preview. Explore connections, agent permissions, and activity with no credit card.",
};

export default function PricingPage() {
  return <PricingContent />;
}
