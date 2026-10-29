import type { Metadata } from "next";
import ConnectionForm from "@/components/connection-form";

export const metadata: Metadata = { title: "Connect an account — through", robots: { index: false, follow: false } };
export default function NewConnectionPage() { return <ConnectionForm />; }
