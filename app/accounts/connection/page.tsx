import type { Metadata } from "next";
import ConnectionDetail from "@/components/connection-detail";

export const metadata: Metadata = { title: "Connection details — through", robots: { index: false, follow: false } };
export default function ConnectionPage() { return <ConnectionDetail />; }
