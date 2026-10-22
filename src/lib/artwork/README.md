# Artwork production files

Authored by DotWin

The crop worker retains the original upload and writes a versioned print master. Canvas fulfillment uses that master directly.

Archival paper and framed paper checkout use `prepare-paper-print.ts` before creating a Stripe payment. It fits the full crop inside at least 0.25 inches of white on every edge, at the purchased paper dimensions, and writes a separate lossless PNG. The source is never overwritten. Output resolution is capped at 300 pixels per inch without enlarging the source. A SHA-256 path includes the crop path, paper dimensions, border, and processing version; repeat checkouts reuse it. The paid snapshot freezes that path so later crops cannot change a paid order.

Processing streams bounded files through temporary storage, rejects sources over 180 million pixels or 350 MiB, times out downloads and rendering, and removes local temporary files. Preparation failures stop both hosted and embedded checkout before payment creation. Existing paid orders remain attached to their captured file.

Tests cover all four white edges at portrait, landscape, and square dimensions; immutable source preservation and cache keys; frame/mat selection preservation; and both payment routes refusing a failed preparation.

New crop selections use EXIF display orientation (`crop_box.orient=true`) before applying the saved quarter-turn rotation. Existing crop boxes keep raw coordinates unless explicitly opted in. Preview metadata, the editor, mat mockups, and the worker use the same coordinate convention; output files clear EXIF orientation to prevent a second rotation. Original uploads are never overwritten.
