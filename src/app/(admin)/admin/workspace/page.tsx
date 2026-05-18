'use client'

import { useEffect, useState } from 'react'

const ADMIN_CONSOLE = 'https://admin.google.com/'
const GMAIL = 'https://mail.google.com/a/artbyme.studio'
const BILLING_PAYMENTS = 'https://admin.google.com/ac/billing/accounts'
const SECURITY_RECOVERY = 'https://myaccount.google.com/security'
const PASSWORD_RESET = 'https://myaccount.google.com/security/signinoptions/password'
const TWO_STEP = 'https://myaccount.google.com/signinoptions/twosv'

const ALIASES: Array<{ alias: string; use: string }> = [
  { alias: 'margaret@artbyme.studio', use: 'Your primary login. Use this for "Sign in with Google" anywhere.' },
  { alias: 'admin@artbyme.studio', use: 'Reserved for Google Workspace admin notices and Vercel/Supabase service alerts.' },
  { alias: 'hello@artbyme.studio', use: 'Public-facing inbox. Commission requests, contact-form submissions, and the newsletter welcome reply-to land here.' },
  { alias: 'sales@artbyme.studio', use: 'Stripe order confirmations and customer payment receipts.' },
  { alias: 'resources@artbyme.studio', use: 'Class enrollments and student-facing email automations.' },
  { alias: 'art@artbyme.studio', use: 'LumaPrints, Printful, and ShipStation fulfillment notifications.' },
  { alias: 'commissions@artbyme.studio', use: 'Quote follow-ups and commission status updates to clients.' },
]

function useDismissed(key: string) {
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  useEffect(() => {
    setDismissed(localStorage.getItem(key) === '1')
  }, [key])
  function dismiss() {
    localStorage.setItem(key, '1')
    setDismissed(true)
  }
  return { dismissed, dismiss }
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-charcoal/10 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </section>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-teal hover:underline font-medium"
    >
      {children}
    </a>
  )
}

export default function WorkspacePage() {
  const billing = useDismissed('artbyme:workspace:billing-dismissed')
  const password = useDismissed('artbyme:workspace:password-dismissed')

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-light text-charcoal">Google Workspace</h1>
        <p className="mt-2 font-body text-charcoal/60 max-w-2xl">
          Your business email, calendar, drive, and admin tools live here. Use the shortcuts below to jump in.
        </p>
      </header>

      {/* Quick links */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-charcoal mb-4">Quick access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={GMAIL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 rounded-md border border-charcoal/10 px-4 py-3 hover:border-teal hover:bg-teal/[0.03] transition-colors"
          >
            <svg className="w-6 h-6 mt-0.5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            <div>
              <p className="font-body font-semibold text-charcoal">Open Gmail</p>
              <p className="font-body text-sm text-charcoal/60">margaret@artbyme.studio inbox</p>
            </div>
          </a>
          <a
            href={ADMIN_CONSOLE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 rounded-md border border-charcoal/10 px-4 py-3 hover:border-teal hover:bg-teal/[0.03] transition-colors"
          >
            <svg className="w-6 h-6 mt-0.5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <div>
              <p className="font-body font-semibold text-charcoal">Open Admin Console</p>
              <p className="font-body text-sm text-charcoal/60">Manage users, billing, security</p>
            </div>
          </a>
        </div>
      </Card>

      {/* Password reminder */}
      {password.dismissed === false && (
        <Card className="border-coral/30 bg-coral/[0.04]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-coral">First-time setup</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-charcoal">Change your password</h2>
              <p className="mt-2 font-body text-sm text-charcoal/70 max-w-2xl">
                You were issued a temporary password. Change it the first time you log in so only you know it.
              </p>
              <div className="mt-4 rounded-md bg-white border border-charcoal/10 p-4 space-y-2 font-mono text-sm">
                <div><span className="text-charcoal/50">Email</span>: margaret@artbyme.studio</div>
                <div><span className="text-charcoal/50">Temporary password</span>: MyArtBusiness2026!</div>
              </div>
              <ol className="mt-4 list-decimal list-inside space-y-1 font-body text-sm text-charcoal/70">
                <li>Go to <ExternalLink href={PASSWORD_RESET}>Google → Security → Password</ExternalLink>.</li>
                <li>Enter the temporary password above when prompted.</li>
                <li>Pick a strong new password. Use a passphrase you can remember.</li>
                <li>Turn on <ExternalLink href={TWO_STEP}>2-step verification</ExternalLink> while you&apos;re there.</li>
              </ol>
            </div>
            <button
              onClick={password.dismiss}
              className="shrink-0 rounded-md border border-charcoal/15 px-3 py-1.5 font-body text-xs font-medium text-charcoal/70 hover:bg-charcoal/5 transition-colors"
            >
              Done — dismiss
            </button>
          </div>
        </Card>
      )}

      {/* Billing reminder */}
      {billing.dismissed === false && (
        <Card className="border-gold/40 bg-gold/[0.05]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-gold">Action required</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-charcoal">Switch billing to your credit card</h2>
              <p className="mt-2 font-body text-sm text-charcoal/75 max-w-2xl">
                Your Workspace is currently billed to <strong className="text-charcoal">DotWin&apos;s corporate dummy card</strong> so we could get you up and running. To keep your email and other Workspace services active, please move billing to your own credit card.
              </p>
              <p className="mt-2 font-body text-sm text-charcoal/75 max-w-2xl">
                You&apos;re on the lowest plan: <strong className="text-charcoal">Google Workspace Business Starter — $8.40 per user per month</strong>. With one user that&apos;s about $8.40/month plus any applicable tax.
              </p>

              <div className="mt-4 rounded-md bg-white border border-charcoal/10 p-4">
                <p className="font-body text-sm font-semibold text-charcoal mb-3">How to change your billing card</p>
                <ol className="list-decimal list-inside space-y-2 font-body text-sm text-charcoal/75">
                  <li>
                    Open the <ExternalLink href={BILLING_PAYMENTS}>Payment accounts</ExternalLink> page in the Google Admin Console.
                  </li>
                  <li>
                    You&apos;ll see one row: <code className="rounded bg-charcoal/5 px-1.5 py-0.5">Google Workspace Business Starter — In use</code>.
                  </li>
                  <li>
                    Click <strong>Actions ▾</strong> at the far right of that row, then choose <strong>View payment methods</strong>.
                  </li>
                  <li>
                    Click <strong>Add payment method</strong>, enter your card, then mark it as the primary method.
                  </li>
                  <li>
                    Remove the old card (DotWin&apos;s) once your card is verified.
                  </li>
                </ol>
                <div className="mt-4 rounded border-l-2 border-charcoal/20 bg-charcoal/[0.02] px-3 py-2 font-body text-xs text-charcoal/55">
                  Visual reference of the page you&apos;re looking for: Admin Console → Billing → Payment accounts. You&apos;ll see the row with the &ldquo;Actions ▾&rdquo; link on the right.
                </div>
              </div>
            </div>
            <button
              onClick={billing.dismiss}
              className="shrink-0 rounded-md border border-charcoal/15 px-3 py-1.5 font-body text-xs font-medium text-charcoal/70 hover:bg-charcoal/5 transition-colors"
            >
              Billing updated — dismiss
            </button>
          </div>
        </Card>
      )}

      {/* What can margaret@artbyme.studio do */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-charcoal">Your new email is also a Google account</h2>
        <p className="mt-2 font-body text-sm text-charcoal/70 max-w-3xl">
          You can use <code className="rounded bg-charcoal/5 px-1.5 py-0.5">margaret@artbyme.studio</code> anywhere you see a <em>&ldquo;Sign in with Google&rdquo;</em> button: Canva, Figma, Notion, ChatGPT, social platforms, basically the whole web. It&apos;s the same account as your inbox, so anything that emails you ends up in Gmail too.
        </p>
        <p className="mt-3 font-body text-sm text-charcoal/70 max-w-3xl">
          Tip: when a site asks you to create an account, picking &ldquo;Sign in with Google&rdquo; means you don&apos;t have to remember another password.
        </p>
      </Card>

      {/* Aliases */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-charcoal">Your email aliases</h2>
        <p className="mt-2 font-body text-sm text-charcoal/70 max-w-3xl">
          All of the addresses below route into the same inbox (yours). You don&apos;t need to check them separately. The split is so that platform notifications stay organized — Gmail filters them automatically.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-charcoal/10">
                <th className="py-2 pr-4 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Address</th>
                <th className="py-2 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">What it&apos;s for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {ALIASES.map((a) => (
                <tr key={a.alias}>
                  <td className="py-3 pr-4 font-mono text-sm text-charcoal whitespace-nowrap">{a.alias}</td>
                  <td className="py-3 font-body text-sm text-charcoal/70">{a.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recovery info */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-charcoal">Set up your recovery info</h2>
        <p className="mt-2 font-body text-sm text-charcoal/70 max-w-3xl">
          Right now your recovery phone number and email are set to DotWin&apos;s, so that if you ever got locked out we could help recover your account. Replace these with your own as soon as you can — that way only you can recover your account.
        </p>
        <div className="mt-4 rounded-md bg-charcoal/[0.03] border border-charcoal/10 p-4 font-body text-sm text-charcoal/75 space-y-1">
          <div><span className="font-semibold">Current recovery phone:</span> 214-625-3080 (Shelby&apos;s work number)</div>
          <div><span className="font-semibold">Current recovery email:</span> admin.artbyme@gmail.com</div>
        </div>
        <ol className="mt-4 list-decimal list-inside space-y-2 font-body text-sm text-charcoal/75">
          <li>Open <ExternalLink href={SECURITY_RECOVERY}>Google → Security</ExternalLink>.</li>
          <li>Scroll to <strong>Ways we can verify it&apos;s you</strong>.</li>
          <li>Click <strong>Recovery phone</strong> → enter your personal mobile number → verify with the SMS code.</li>
          <li>Click <strong>Recovery email</strong> → enter a personal email (a Gmail or your previous email works) → verify the link.</li>
        </ol>
      </Card>

      {/* Helpful links */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-charcoal">Useful links</h2>
        <ul className="mt-3 space-y-2 font-body text-sm">
          <li><ExternalLink href={GMAIL}>Gmail (your inbox)</ExternalLink></li>
          <li><ExternalLink href="https://drive.google.com/a/artbyme.studio">Google Drive (file storage)</ExternalLink></li>
          <li><ExternalLink href="https://calendar.google.com/a/artbyme.studio">Google Calendar</ExternalLink></li>
          <li><ExternalLink href="https://contacts.google.com/">Google Contacts</ExternalLink></li>
          <li><ExternalLink href={ADMIN_CONSOLE}>Admin Console (workspace settings)</ExternalLink></li>
          <li><ExternalLink href={BILLING_PAYMENTS}>Billing &amp; payments</ExternalLink></li>
          <li><ExternalLink href={SECURITY_RECOVERY}>Security &amp; recovery</ExternalLink></li>
          <li><ExternalLink href="https://support.google.com/a/answer/33327">How to change your password (Google support)</ExternalLink></li>
          <li><ExternalLink href="https://support.google.com/accounts/answer/183723">How to add a recovery phone (Google support)</ExternalLink></li>
        </ul>
      </Card>
    </div>
  )
}
