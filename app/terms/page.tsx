import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms — through", description: "The terms for using the through preview." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" lead="These terms cover your use of the through preview, including connecting AI apps to it.">
      <h2>The preview</h2>
      <p>through is an early preview. Sign-in requests are simulated and no credentials are entered into websites. Features may change or stop, and data may be reset. Do not rely on through for anything critical.</p>

      <h2>Your use</h2>
      <ul>
        <li>Use fictional accounts. Do not enter real passwords, codes, or other secrets.</li>
        <li>Only connect accounts and websites you are authorized to use, and follow those websites’ terms.</li>
        <li>Do not attempt to break, overload, or get around through’s security or permission controls, or use it to access anything you are not allowed to.</li>
        <li>You are responsible for the AI apps you connect and the permissions you give them.</li>
      </ul>

      <h2>Your information</h2>
      <p>You keep ownership of what you enter. You let us store and process it to run the service, as described in our <a href="/privacy/">Privacy</a> page.</p>

      <h2>No warranty</h2>
      <p>The preview is provided “as is” and “as available,” without warranties of any kind, to the extent the law allows.</p>

      <h2>Limitation of liability</h2>
      <p>To the extent the law allows, we are not liable for indirect, incidental, or consequential damages, or for lost data or profits, arising from your use of the preview.</p>

      <h2>Ending access</h2>
      <p>You can stop using through and ask us to delete your workspace at any time. We may suspend access that breaks these terms or puts the service at risk.</p>

      <h2>Changes and contact</h2>
      <p>We may update these terms and will revise the date above when we do. For questions, <Contact />.</p>
    </LegalPage>
  );
}
