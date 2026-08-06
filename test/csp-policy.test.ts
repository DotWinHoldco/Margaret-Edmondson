import { describe, expect, it } from 'vitest'
import {
  buildContentSecurityPolicy,
  generateCspNonce,
  CSP_REPORT_PATH,
  CSP_REPORT_GROUP,
  CSP_REPORTING_ENDPOINTS,
} from '@/lib/security/csp'

// Next.js parses the nonce back out of the request header with this exact
// pattern, so a nonce it cannot read silently drops every script on the page.
const NEXT_NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/

function directive(policy: string, name: string): string {
  const found = policy
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `))
  if (!found) throw new Error(`missing directive: ${name}`)
  return found
}

describe('generateCspNonce', () => {
  it('produces a value Next.js can parse out of the policy', () => {
    const nonce = generateCspNonce()
    expect(`'nonce-${nonce}'`).toMatch(NEXT_NONCE_SOURCE)
  })

  it('is unique per call', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCspNonce()))
    expect(seen.size).toBe(200)
  })
})

describe('buildContentSecurityPolicy', () => {
  const policy = buildContentSecurityPolicy('TESTNONCE123456789012==', false)

  it('carries the nonce in script-src where Next.js looks for it', () => {
    const scriptSrc = directive(policy, 'script-src')
    expect(scriptSrc).toContain(`'nonce-TESTNONCE123456789012=='`)
  })

  it('never allows inline or eval scripts in production', () => {
    const scriptSrc = directive(policy, 'script-src')
    expect(scriptSrc).not.toContain(`'unsafe-inline'`)
    expect(scriptSrc).not.toContain(`'unsafe-eval'`)
  })

  it('keeps inline styles allowed and nonce-free', () => {
    // A nonce in style-src would silently disable 'unsafe-inline', which
    // Tailwind's critical CSS and framer-motion's per-frame element.style
    // writes both depend on.
    const styleSrc = directive(policy, 'style-src')
    expect(styleSrc).toContain(`'unsafe-inline'`)
    expect(styleSrc).not.toContain('nonce-')
  })

  it('preserves every third-party host the site depends on', () => {
    expect(directive(policy, 'script-src')).toContain('https://js.stripe.com')
    expect(directive(policy, 'script-src')).toContain('https://connect.facebook.net')
    expect(directive(policy, 'style-src')).toContain('https://fonts.googleapis.com')
    expect(directive(policy, 'font-src')).toContain('https://fonts.gstatic.com')
    expect(directive(policy, 'img-src')).toContain('https://*.supabase.co')
    expect(directive(policy, 'connect-src')).toContain('https://*.supabase.co')
    expect(directive(policy, 'connect-src')).toContain('https://api.stripe.com')
    expect(directive(policy, 'connect-src')).toContain('https://*.resend.com')
    expect(directive(policy, 'frame-src')).toContain('https://hooks.stripe.com')
    expect(directive(policy, 'frame-src')).toContain('https://www.youtube.com')
    expect(directive(policy, 'frame-src')).toContain('https://www.youtube-nocookie.com')
    expect(directive(policy, 'frame-src')).toContain('https://player.vimeo.com')
  })

  it('matches Stripe documented requirements for Elements', () => {
    // Frames are not covered by 'strict-dynamic', so these are load-bearing.
    expect(directive(policy, 'frame-src')).toContain('https://*.js.stripe.com')
    // The checkout passes `fonts: [{ cssSrc }]` to Elements and Stripe fetches
    // that stylesheet, which makes it a connect-src source too.
    expect(directive(policy, 'connect-src')).toContain('https://fonts.googleapis.com')
  })

  it('locks down the directives an injected payload would reach for', () => {
    expect(directive(policy, 'object-src')).toBe("object-src 'none'")
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(policy, 'form-action')).toBe("form-action 'self'")
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  it('wires both reporting channels to the collector', () => {
    expect(directive(policy, 'report-uri')).toBe(`report-uri ${CSP_REPORT_PATH}`)
    expect(directive(policy, 'report-to')).toBe(`report-to ${CSP_REPORT_GROUP}`)
    // The report-to group name has to match the Reporting-Endpoints header or
    // Chromium drops the report without a trace.
    expect(CSP_REPORTING_ENDPOINTS).toBe(`${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`)
  })

  it('relaxes eval and the HMR socket only in development', () => {
    const dev = buildContentSecurityPolicy('devnonce==', true)
    expect(directive(dev, 'script-src')).toContain(`'unsafe-eval'`)
    expect(directive(dev, 'connect-src')).toContain('ws:')
    expect(directive(policy, 'connect-src')).not.toContain('ws:')
  })
})
