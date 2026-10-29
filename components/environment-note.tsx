"use client";

import { serviceMode } from "@/lib/client";

export default function EnvironmentNote() {
  return <>{serviceMode ? "Go sandbox · External sign-in uses placeholders." : "Browser demo · No backend or external accounts connected."}</>;
}
