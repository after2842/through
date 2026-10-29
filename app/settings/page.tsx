import type { Metadata } from "next";
import UserSettings from "@/components/user-settings";

export const metadata: Metadata = { title: "Settings — through", robots: { index: false, follow: false } };
export default function SettingsPage() { return <UserSettings />; }
