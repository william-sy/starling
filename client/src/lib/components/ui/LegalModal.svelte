<script lang="ts">
  export let type: 'terms' | 'privacy';
  export let onClose: () => void;

  const titles = {
    terms:   'Terms of Service',
    privacy: 'Privacy Policy',
  };

  const content = {
    terms: `
TERMS OF SERVICE - Starling (mwt B.V.)
Draft v0.1 - effective at public launch

1. THE SERVICE
Starling provides end-to-end encrypted messaging. We relay your messages but cannot read them. We have no access to your contact list, message content, or media.

2. YOUR ACCOUNT
Your account is identified by a PIN and secured by a 24-word recovery phrase that only you hold. We cannot reset your account. If you lose both, access is permanently lost.

3. ACCEPTABLE USE
You may not use Starling for illegal activity, abuse, harassment, or to distribute malware. Because messages are encrypted, you bear sole responsibility for content you send.

4. THE SERVICE IS PROVIDED "AS IS"
Starling is provided without warranty. We are not liable for message delivery failures, data loss, or damages arising from use of the service.

5. PAID PLANS
Purchases are governed by the pricing page in effect at time of purchase. EU consumers have a statutory 14-day cancellation right for unused digital services.

6. CHANGES
We may update these terms. Continued use after notice constitutes acceptance.

7. GOVERNING LAW
These terms are governed by Dutch law. Disputes are subject to the jurisdiction of the courts of Amsterdam, Netherlands.
    `.trim(),

    privacy: `
PRIVACY POLICY - Starling (mwt B.V.)
Draft v0.1 - effective at public launch

DATA CONTROLLER
mwt B.V., Amsterdam, Netherlands. Contact: privacy@selectedwithtrust.com

WHAT WE COLLECT
- Your account PIN (required for relay routing)
- Billing email address (only if you purchase a paid plan)
- Encrypted message payloads temporarily held for delivery (deleted on delivery or after 30 days)
- Technical logs: connection timestamps, IP addresses (retained 90 days)

WHAT WE DO NOT COLLECT
- Message content (end-to-end encrypted, we have no key)
- Your contact list
- Your location
- Any behavioural or advertising data

LEGAL BASIS (GDPR Art. 6)
- Contract performance (Art. 6(1)(b)): account operation, message relay, billing
- Legal obligation (Art. 6(1)(c)): 7-year retention of billing records (EU tax law)
- Legitimate interest (Art. 6(1)(f)): security logs

YOUR RIGHTS
You have the right to access, correct, port, and erase your personal data. To exercise these rights, use the Privacy section in Settings or contact privacy@selectedwithtrust.com. We respond within 30 days.

DATA TRANSFERS
Data is processed and stored in the European Union. No transfers to third countries.

SUPERVISORY AUTHORITY
Autoriteit Persoonsgegevens (AP), The Hague, Netherlands - autoriteitpersoonsgegevens.nl
    `.trim(),
  };
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label={titles[type]}>
  <div class="sheet">
    <div class="header">
      <h2>{titles[type]}</h2>
      <button class="close" on:click={onClose} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="body">
      <pre>{content[type]}</pre>
    </div>
    <div class="footer">
      <button class="btn-primary" on:click={onClose}>Close</button>
    </div>
  </div>
</div>

<style>
.overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
  padding: 1.5rem;
}
.sheet {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 100%; max-width: 540px;
  max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg);
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
h2 { font-size: 17px; font-weight: 700; }
.close {
  color: var(--text-muted); padding: .25rem; border-radius: var(--radius);
  transition: color .1s;
}
.close:hover { color: var(--text); }
.body {
  flex: 1; overflow-y: auto;
  padding: 1.25rem 1.5rem;
}
pre {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}
.footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.btn-primary {
  width: 100%; padding: .7rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 14px; font-weight: 600;
  transition: opacity .15s;
}
.btn-primary:hover { opacity: .9; }
</style>
