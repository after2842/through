import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy — through", description: "What through collects, why, and how long it keeps it." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" lead="through is in preview. This page describes what the preview service collects when you sign in, connect accounts, and connect AI apps such as Claude or ChatGPT.">
      <h2>What we never collect</h2>
      <p>through does not ask for, receive, or store website passwords, one-time or MFA codes, recovery codes, or tokens from the sites you connect. AI apps connected to through never receive a password from it. In this preview, through does not enter credentials into any website.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your sign-in email</strong>, and an optional display name. In this preview the email is not verified.</li>
        <li><strong>Connection details you enter:</strong> a site name, its sign-in domain, the account username or label you give it, and which agents (Claude, Codex, Cursor) may use it.</li>
        <li><strong>Activity records:</strong> who did what and when, such as connecting an account, changing permissions, pausing access, or requesting a sign-in. Records include your email and non-secret labels, never passwords.</li>
        <li><strong>AI app connections:</strong> when you connect an app, we store the name it reports, the address it returns to, the agent you chose for it, when it was last used, and its access tokens in hashed form.</li>
        <li><strong>What connected apps send us:</strong> the inputs to through’s tools, such as a website address, a browser tab identifier, and a request key. We do not receive your conversations with the app.</li>
        <li><strong>Request logs:</strong> our service logs a request ID, method, status, and duration. Our hosting provider, Google Cloud, also keeps standard request logs that include IP address and user agent.</li>
      </ul>

      <h2>How we use it</h2>
      <p>Only to run through: to sign you in, enforce the permissions you set, show your activity, and keep the service secure. We do not sell your information, use it for advertising, or use it to train AI models.</p>

      <h2>Who receives it</h2>
      <ul>
        <li><strong>Google Cloud</strong> hosts the service and its database.</li>
        <li><strong>AI apps you connect</strong> receive what through’s tools return: your connected account labels and sign-in domains, whether their agent may use each one, and, for owners and admins, recent activity. You choose which apps to connect and can disconnect them at any time.</li>
      </ul>
      <p>We disclose information if the law requires it.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Browser sessions last 8 hours. App access tokens last 1 hour and refresh tokens 30 days, or until you disconnect the app.</li>
        <li>Accounts, connections, and activity records are kept while your workspace exists. You can ask us to delete your workspace.</li>
        <li>Google Cloud request logs are kept for 30 days by default.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Disconnect any AI app in Settings. Its access ends immediately.</li>
        <li>Remove connected accounts, change which agents may use them, or pause all agent access.</li>
        <li>Ask for a copy of your information, or for its deletion, using the contact below.</li>
      </ul>

      <h2>Security</h2>
      <p>Traffic is encrypted in transit. Session and access tokens are stored only as hashes. Because this is a preview, use fictional accounts and never enter a real password anywhere in through.</p>

      <h2>Children</h2>
      <p>through is not directed to children under 13 and does not knowingly collect their information.</p>

      <h2>Changes and contact</h2>
      <p>We will update this page when our practices change and revise the date above. For privacy questions or requests, <Contact />.</p>
    </LegalPage>
  );
}
