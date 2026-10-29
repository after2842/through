import type { Metadata } from "next";
import AccountsWorkspace from "@/components/accounts-workspace";

export const metadata: Metadata = {
  title: "Your accounts — through",
  description: "Choose the accounts your AI agents can access. An interactive through demo.",
  robots: { index: false, follow: false },
};

export default function AccountsPage() {
  return <AccountsWorkspace />;
}
