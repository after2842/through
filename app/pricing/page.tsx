import type { Metadata } from "next";
import PricingContent from "@/components/pricing-content";

export const metadata: Metadata = {
  title: "Pricing — through",
  description: "Explore proposed through plans. The current demo is free; billing is not connected.",
};

export default function PricingPage() {
  return <PricingContent />;
}
