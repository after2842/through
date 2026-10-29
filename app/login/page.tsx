import EnvironmentNote from "@/components/environment-note";
import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import LoginForm from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in — through",
  description: "Explore through with a demo email and authentication code.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="page app-page">
      <SiteHeader action={<a className="quiet-link" href="/">Back home</a>} />
      <main id="main" className="app-main">
        <LoginForm />
      </main>
      <footer className="app-footer"><EnvironmentNote /></footer>
    </div>
  );
}
