# Paired markup and gross margin

All current pricing input labels now distinguish markup from gross margin. Settings, category creation/editing, product defaults, existing sizes, the add-size dialog, and the learning calculator show their relationship. Either editable percentage updates the other; persisted API/database keys remain compatible. Manual prices display their actual relationship without letting an unused markup edit imply that a fixed price changed.

The calculation remains cost-plus: landed cost × (1 + markup / 100). Price less landed cost is gross profit dollars; gross profit divided by price is gross margin. A positive-cost target gross margin must be below 100%. Existing shop/product markup limits remain enforced. Blank inheritance, zero markup, unknown costs, manual losses, invalid inputs, and full-precision conversion are covered by focused tests.

The old settings refresh buttons used a different pricing model. Current settings now link to the existing canonical per-product cost refresh. Saving shop pricing still recalculates automatic prices from saved costs. The unused legacy endpoint preserves admin authentication and returns a descriptive 410 without repricing anything.

Verification: `npm run build-check` printed GREEN (typecheck, lint, full tests, production build and required custom gates). Twenty focused tests cover math, linked inputs, shop/category persistence, manual/zero-cost calculator behavior, variants and retirement of the legacy endpoint. The 10-page client guide was rewritten and visually verified; only pages 5–6 changed from the previously approved render.

Source commit `d6c8329` was deployed successfully to `https://www.artbyme.studio` through deployment `margaret-edmondson-rgi6q1cx0-dotwinholdcos-projects.vercel.app`. Final live-browser interaction and new help screenshots remain unverified: Chrome browser-client calls timed out despite the installed/enabled extension, valid native host, and documented connection retry. The user was asked to reconnect the extension. Existing pricing screenshots are explicitly captioned as the earlier layout so they are not presented as the new paired controls.
