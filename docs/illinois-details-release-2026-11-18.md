# Illinois shared class details — release record

Authored by DotWin. Published November 18, 2026.

The owner clarified that “same everything else” means the Illinois event is the same Festive Paint class offered in North Texas. The Illinois listing now says this explicitly, and the class detail pages display the complete shared description at the top: paint at your own pace, pre-drawn 8×10 canvas, all materials, self-guided instruction/information sheet and on-site instruction. The four project choices and Illinois-specific schedule, location, prices and deadline remain intact.

- Source: https://github.com/DotWinHoldco/Margaret-Edmondson, branch `codex/margaret-illinois-class`, application commit `b2ad4e406570cc2974b810441d76d1bf6f1c69b8`.
- Annotated tag: `margaret-illinois-details-2026-11-18` at the application commit.
- Existing DotWin-managed project `prj_ntGVQ8P3ptujQICjhQMZbyPpmC0j`; deployment `dpl_ErfLU5BM3xHzTK6jzExiP7sFpSfo`.
- Deployment URL: https://margaret-edmondson-1u936wlzj-dotwinholdcos-projects.vercel.app
- Live URL: https://www.artbyme.studio/classes/festive-paint-marion-il
- Local `npm run build-check` and hosted `npm run build-check:write` printed GREEN. Logs: `docs/build-checks/illinois-details-local.txt` and `docs/build-checks/illinois-details-hosted.txt`. Existing advisory findings and optional CI-credential-dependent skips remain as documented in the payment release.
- Preview HTTP 200 showed the complete description in the introductory paragraph. After promotion, the public class and Classes listing returned HTTP 200, identified the new deployment and displayed the new wording, included materials and November 22 deadline. Live checkout remains offered. Browser review verified the visible text and four paintings.
- Runtime unchanged: local Node v26.0.0, npm 11.12.1, Next.js 16.3.8; hosted Node setting 24.x, exact patch unreported. Deployment CLI local 54.1.0, hosted 65.17.0. package-lock.json is unchanged, SHA-256 `de04675fc0a7fc44c1996d1c9aaed46ee2491f8823f60001c0669087faa9d08b`.
- No additional migration, dependency install or payment transaction. Existing migration and callback-routing settings are recorded in `illinois-class-release-2026-11-18.md`.
- DotWin handoff branch `codex/margaret-illinois-handoff` preserves the updated playbook, this record and the implementation patch under `docs/sites/margaret-edmondson/`. Current local working setup and original owner files are retained.

For source recovery, fetch the application repository and check out the annotated tag, use the existing lockfile/environment setup, run npm run build-check and publish through the same project. To undo only this wording update, promote prior deployment `dpl_73oBnNLTMMe7VmRtwt2aMnkUuDmX`; its payment-routing repair and class checkout remain available. Do not change the apex domain routing or class database state for this wording rollback.
