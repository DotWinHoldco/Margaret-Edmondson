# Illinois class and payment delivery — release record

Authored by DotWin. Published November 18, 2026.

## Published source

- Application repository: https://github.com/DotWinHoldco/Margaret-Edmondson
- Application commit: `ef2055764fbaf9e6468c273d1c92190d153052eb` on `codex/margaret-illinois-class`.
- Annotated release tag: `margaret-illinois-payments-2026-11-18` points to that application commit.
- Existing DotWin-managed project: `prj_ntGVQ8P3ptujQICjhQMZbyPpmC0j`, team `team_m2LgJy4E3OF5MMzl4zqP7cFY`.
- Production deployment: `dpl_73oBnNLTMMe7VmRtwt2aMnkUuDmX`, https://margaret-edmondson-5g218bb5n-dotwinholdcos-projects.vercel.app
- Public class: https://www.artbyme.studio/classes/festive-paint-marion-il
- Built with production settings and custom domains held back; the same verified deployment was promoted without rebuilding. Public-domain deployment lookup and rendered pages identify the application commit/deployment above.
- DotWin handoff: `codex/margaret-illinois-handoff` in https://github.com/DotWinHoldco/DOTWIN, `docs/sites/margaret-edmondson/`. Includes the owner playbook, draft reply, release record and editable source patch from baseline `69d8e986aa4b91b889344526f10c46e0c19cebe4` through the application commit.

## Result

The Classes page now lists North Texas and Southern Illinois separately. Marion is November 24, 5–8 PM Central at 401 S. Court St. The class has the original four painting choices, group signup, embedded payment fields and separate bookings/rosters/emails. The price is $20 per painter through November 22 at 11:59 PM Central, then $25. Migration `20261118192737_festive_illinois_class` is applied; Illinois `accepting` was enabled after both builds passed. Existing Texas checkout remains live.

The non-www callback formerly returned HTTP 308 before reaching the application. The hosting project's blanket `artbyme.studio` redirect was cleared after deploying a host-specific redirect in next.config.ts. The exact `/api/webhooks/stripe` path now reaches the original signature-checking handler directly; other apex paths still redirect to www, preserving paths and query strings. DNS, account credentials, Stripe signing secrets and event subscriptions were not changed.

The private class confirmation lookup can also recover a delayed callback: after validating the registration capability and class, the server retrieves the bound Stripe PaymentIntent, verifies its identity, amount, currency, mode and class metadata, retrieves its genuine success event, and calls the existing atomic settlement owner. No invented Stripe events or browser-reported paid states are accepted. Event IDs and email outbox records remain idempotent. Event lookup is bounded to 300 success events per refresh and Stripe's 30-day event retention. Old Texas intents without class metadata remain compatible; Illinois requires the matching class.

## Verification and limits

- Local `npm run build-check` and hosted `npm run build-check:write` printed **GREEN**. Evidence: `docs/build-checks/illinois-payments-local.txt` and `docs/build-checks/illinois-payments-hosted.txt`.
- Five focused files passed 41 tests. Coverage includes authoritative payment recovery, mismatched amount/currency/class/mode/merchant rejection, absent events, bounded lookup, failed persistence, private capability enforcement, rate limiting, canonical routing, idempotent emails and real database transaction tests. Existing full-suite tests also passed through the build runner.
- The staged browser opened live Stripe card fields for $20 using a clearly labeled unpaid verification registration. It created registration `1fdcad19-7c99-41a2-a4a3-aa4c809a99ea`, live PaymentIntent `pi_3UdH2BLsqopqqsk409axOeDS`, status pending, total 2,000 cents, no paid_at. No card details, payment submission or confirmation email were sent. Its synthetic email is reserved example.com test data; it is excluded from the paid roster. The private capability was not published or committed.
- The public Illinois and Texas pages return HTTP 200 and offer live checkout. The class listing returns 200 and includes both locations. Browser review confirms the public Illinois date, venue, price and signup button.
- Apex homepage and class URL still return 308 to the corresponding www URL with query preserved. Both callback hostnames return HTTP 400 for unsigned requests with no Location header. Invalid signatures are rejected. Admin roster returns 307 to sign-in.
- Actual application webhook logs show live payment_intent.succeeded order processing on November 5 and 8. No new live paid transaction was run in this release.
- Margaret's Stripe dashboard remains inaccessible to this session; available connector access is DotWin's merchant, and the owner does not have her account access. The website repair cannot re-enable a disabled Stripe endpoint or replay historical failed deliveries. That account-level state and old payments remain unverified. The webhook work request stays Working for that follow-up; the Illinois request is Completed.
- Existing advisory documentation/RLS findings remain nonblocking. The optional grant-boundary audit was skipped where Supabase CI credentials were unavailable; not all optional audits ran.

## Runtime and retention

Local Node `v26.0.0`, npm `11.12.1`, Next.js `16.3.8`; hosted Node setting `24.x`; local Vercel CLI `54.1.0`, hosted CLI `65.17.0`. Exact hosted Node/npm patch versions were not reported. Existing package-lock.json is unchanged, SHA-256 `de04675fc0a7fc44c1996d1c9aaed46ee2491f8823f60001c0669087faa9d08b`.

Current local dependencies, usable build output, owner artwork and pre-existing uncommitted work are retained. Source scans were excluded from hosted uploads, not deleted. No duplicate backup checkout or dependency install was created. The approved application and DotWin branches preserve source remotely; the release tag preserves the deployed application commit.

## Recovery

Fetch the application repository and check out `margaret-illinois-payments-2026-11-18` to recover this source. Use the existing approved environment/secrets system and lockfile, install dependencies only if absent, run npm run build-check, and publish through the same DotWin-managed project with domains held back until checked.

If an application rollback is necessary, close Illinois registration first and promote prior deployment `dpl_9t2yCp5snXAs85mdXhTvTGy5tmpX` (baseline `69d8e986aa4b91b889344526f10c46e0c19cebe4`). Preserve class tables, registrations and the additive migration. Keep the apex hosting redirect unset so Stripe callbacks stay reachable; restore the path-specific www canonical rule in a forward fix. Re-enabling the former blanket redirect would reintroduce the known callback failure unless Margaret first changes her Stripe endpoint to www and verifies it.

Work-request comments and status audit entries are operational records, separate from source rollback. Correct them through the normal audited workflow without rewriting history.
