# Margaret's October 21 site updates

Authored by DotWin

Prints lead the product page. Print families use the requested names in two columns, sizes display measurements in ascending area, canvas choices say Canvas Depth, and framed-paper mats appear before frames. Compatible mat selections survive frame changes. Solid canvas sides provide black, grey, and white presets alongside mirror wrap.

The catalog operation in `scripts/margaret-20261021-catalog.sql` uses existing production provider options: installed wire for framed prints, kraft backing for framed paper, half-inch mat increments from 1 through 3 inches, and white with a black core. It updates legacy paper backing too, invalidates affected quote caches, and records complete before/after rows in `audit_log` under `margaret_request_20261021`. It was applied atomically on October 21. Price additions use the provider quote, not a guessed surcharge. Image Wrap remains unavailable because that option requires different source bleed. The unframed 1.25-inch stretched-canvas catalog only offers sawtooth hardware; the wire requirement is implemented for every framed profile.

Paper checkout prepares a separate immutable image with at least 1/8 inch of white on all four sides. The saved crop and canvas file remain untouched. A real Due Date derivative was created and read from private storage; all four edges were white and the master path was unchanged. The larger Think Again download exceeded the local 90-second download limit and correctly stopped preparation. Checkout fails before payment if preparation cannot finish; cached derivatives are reused.

Gallery is restored as a continuous grid ordered by explicit year tags, newest first. Undated artwork follows in title order pending Margaret's year list. Road Trip was already a draft and remains unpublished. Beach includes FL, SC, AL, and CA; Custom Portraits becomes Commissions. Biography and CV links say View and open inline PDFs.

## Preserve the deployed baseline

The production deployment `dpl_AEw6pYBhixKk7jAfQFNyLH3MLqme` was published from the CLI with source changes absent from GitHub main `4a34b2e`. Publishing main alone would remove the biography PDF, review pages, crop workspace, public print previews, detailed frame materials, product mat settings, and other existing behavior. Its differing source, migrations, and frame assets were recovered through the Vercel file API, verified against their SHA-1 identifiers, and merged with these changes. Existing tests were reconciled with the recovered behavior, including whole-dollar automatic prices, exact manually overridden prices, and the newer crop controls. Recovery does not apply migrations or send messages.

The email profile photo still requires a signed-in Google Workspace administrator for Margaret's domain. No email was sent. The complete gallery chronology still depends on Margaret's promised year list.
