<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';

  export let open = false;
  export let tab: 'privacy' | 'terms' = 'privacy';

  function close() { open = false; }
</script>

<Modal {open} title={tab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} width="620px" on:close={close}>
  <div class="tabs">
    <button class="tab" class:active={tab === 'privacy'} on:click={() => tab = 'privacy'}>Privacy Policy</button>
    <button class="tab" class:active={tab === 'terms'}   on:click={() => tab = 'terms'}>Terms of Service</button>
  </div>

  {#if tab === 'privacy'}
    <div class="doc">
      <p class="effective">Effective date: 1 January 2025 &nbsp;·&nbsp; Version 0.1</p>

      <h3>1. Who we are</h3>
      <p>Starling ("we", "us") is an early-access messaging service operated by mwt B.V. from the European Union. We are committed to privacy by design and full compliance with the General Data Protection Regulation (GDPR) and the ePrivacy Directive.</p>

      <h3>2. Zero-knowledge architecture</h3>
      <p>All messages are end-to-end encrypted on your device before transmission. Our servers relay encrypted ciphertext only. We do not possess, and cannot derive, any decryption keys. This means we are technically incapable of reading your messages.</p>
      <ul>
        <li>Private keys are generated on your device and never leave it.</li>
        <li>Message content is never stored on our servers after delivery confirmation.</li>
        <li>We do not perform content scanning, keyword detection, or message analysis of any kind.</li>
      </ul>

      <h3>3. Data we collect</h3>
      <p>We collect the absolute minimum necessary to operate the service:</p>
      <ul>
        <li><strong>Account PIN</strong>:a locally generated identifier used for contact discovery. Not linked to your real identity.</li>
        <li><strong>Display name</strong>:chosen by you, changeable at any time, not verified.</li>
        <li><strong>Delivery metadata</strong>:timestamp and encrypted recipient PIN for each message, retained for up to 30 days to ensure delivery, then permanently deleted.</li>
        <li><strong>Connection IP address</strong>:held in server access logs for up to 7 days for abuse prevention, then deleted.</li>
      </ul>
      <p>We do not collect your phone number, email address, real name, location, or any biometric data.</p>

      <h3>4. Legal basis for processing</h3>
      <p>We process the above data on the basis of <strong>contractual necessity</strong> (Art. 6(1)(b) GDPR) to provide the messaging service you have requested.</p>

      <h3>5. Data retention</h3>
      <p>Encrypted message payloads are purged from relay servers within 30 days of creation or immediately upon confirmed delivery, whichever is sooner. Account metadata may be retained for up to 7 years where required by EU financial or tax regulation (applicable only if you hold a paid subscription).</p>

      <h3>6. Your rights under GDPR</h3>
      <p>As a data subject in the EU/EEA you have the right to: access your data, rectify inaccurate data, erasure ("right to be forgotten"), portability, restriction of processing, and to object to processing. To exercise any right, contact us at <strong>privacy@mwt.app</strong>. We will respond within 30 days.</p>

      <h3>7. Data transfers</h3>
      <p>All servers are located within the European Economic Area. We do not transfer personal data to third countries.</p>

      <h3>8. Cookies and tracking</h3>
      <p>The desktop application does not use cookies. No third-party analytics, advertising SDKs, or tracking pixels are embedded in the application.</p>

      <h3>9. Changes to this policy</h3>
      <p>We will notify you of material changes via an in-app notice at least 14 days before they take effect.</p>

      <h3>10. Contact</h3>
      <p>Data controller: mwt B.V., European Union. Email: <strong>privacy@mwt.app</strong></p>
    </div>

  {:else}
    <div class="doc">
      <p class="effective">Effective date: 1 January 2025 &nbsp;·&nbsp; Version 0.1</p>

      <h3>1. Acceptance</h3>
      <p>By creating an account or using Starling you agree to these Terms. If you do not agree, do not use the service. These Terms form a binding contract between you and mwt B.V.</p>

      <h3>2. Eligibility</h3>
      <p>You must be at least 16 years of age to use Starling. By using the service you represent that you meet this requirement. Where local law requires a higher minimum age, that higher age applies to you.</p>

      <h3>3. Your account</h3>
      <p>Your account is identified by a randomly generated PIN. You are responsible for all activity under your account. Keep your recovery phrase secure: we cannot recover your account on your behalf.</p>

      <h3>4. Acceptable use</h3>
      <p>You agree not to use Starling to:</p>
      <ul>
        <li>Send unsolicited commercial messages (spam).</li>
        <li>Harass, threaten, or abuse other users.</li>
        <li>Distribute malware, phishing content, or illegal material.</li>
        <li>Circumvent technical measures of the service.</li>
        <li>Use automated means to access or scrape the service.</li>
        <li>Violate any applicable law or regulation.</li>
      </ul>
      <p>We reserve the right to terminate accounts that violate these rules. Because messages are end-to-end encrypted, enforcement relies on reports from recipients.</p>

      <h3>5. Intellectual property</h3>
      <p>The Starling application, brand, and codebase are the property of mwt B.V. The open-source components are licensed under their respective licences (see Settings → About → Licences). You retain all rights to the content you send; by sending it you grant the recipient a licence to view it.</p>

      <h3>6. Early access disclaimer</h3>
      <p>Starling is currently in early access. The service is provided <strong>"as is"</strong> without warranties of any kind, express or implied, including fitness for a particular purpose or uninterrupted availability. We are not liable for loss of messages, data, or business arising from service unavailability during this period.</p>

      <h3>7. Limitation of liability</h3>
      <p>To the maximum extent permitted by applicable law, mwt B.V.'s total liability to you for any claim arising out of or relating to these Terms or the service is limited to the amount you paid us in the 12 months preceding the claim, or €10, whichever is greater.</p>

      <h3>8. Governing law</h3>
      <p>These Terms are governed by the laws of the Netherlands. Any disputes shall be subject to the exclusive jurisdiction of the courts of Amsterdam, the Netherlands, without prejudice to your rights as an EU consumer.</p>

      <h3>9. Changes</h3>
      <p>We may update these Terms. We will give you at least 14 days' notice of material changes via an in-app notification. Continued use after the effective date constitutes acceptance.</p>

      <h3>10. Contact</h3>
      <p>mwt B.V., European Union. Email: <strong>legal@mwt.app</strong></p>
    </div>
  {/if}
</Modal>

<style>
.tabs {
  display: flex; gap: .35rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: .75rem;
}
.tab {
  font-size: 13px; font-weight: 600;
  padding: .35rem .8rem;
  border-radius: var(--radius);
  color: var(--text-muted);
  transition: color .12s, background .12s;
  letter-spacing: -0.01em;
}
.tab:hover  { color: var(--text-2); background: var(--surface-2); }
.tab.active { color: var(--accent); background: oklch(from var(--accent) l c h / 0.10); }

/* Legal document */
.doc {
  display: flex; flex-direction: column; gap: .9rem;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.7;
}

.effective {
  font-size: 12px;
  color: var(--text-faint);
  padding: .5rem .85rem;
  background: var(--surface-2);
  border-radius: var(--radius);
  border: 1px solid var(--border-subtle);
  letter-spacing: .01em;
}

h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
  margin-top: .4rem;
}

p { margin: 0; }
strong { color: var(--text); font-weight: 600; }

ul {
  padding-left: 1.2rem;
  display: flex; flex-direction: column; gap: .3rem;
}
li { line-height: 1.6; }
</style>
