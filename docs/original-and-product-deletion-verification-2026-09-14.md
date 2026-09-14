# Original sales and product removal

Saving Sell original artwork with a positive Base price creates one original purchase option alongside print options. Disabling it deactivates that option without deleting stock or order history. Re-enabling preserves existing inventory. A legacy sold product receives zero stock when its missing original option is created. A unique partial index prevents multiple originals on one product. Original prices stay independent of print markup; originals route to the studio while enabled Lumaprints prints use their provider.

Storefront, product badges and all three funnel templates respect original activation. Checkout rejects disabled and sold originals while accepting eligible prints from the same listing. Legacy product-save variant arrays cannot overwrite or remove managed original and print options.

Deleting a product archives it and immediately removes its row on success. The default list and its reload exclude archived products. The explicit Archived filter preserves access to history and editing. Failed deletion keeps the row and shows an error; missing products return 404.

Verification: full `npm run build-check` printed GREEN. Thirty-three focused UI, checkout and availability tests passed; five product-save/delete route tests passed. Lifecycle SQL assertions passed on a disposable PostgreSQL 17 database and on the linked database inside a rolled-back transaction. Verified zero test fixtures remained afterward. Supabase migration `20260914230200_sync_original_product_variant` is applied; the new security-invoker trigger has no advisor finding. Existing advisor notices concern unchanged functions/tables.

The client guide remains 10 pages; the revised product setup page was rendered and visually checked. The live Chrome walkthrough remains unavailable because the browser extension connection is unresponsive. Automated component interactions and actual database assertions are verified; no live payment was made.
