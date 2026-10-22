# Margaret’s October 22 refinements

Authored by DotWin

Intuition’s replacement JPEG has EXIF Orientation 3 (180°). Its raw pixels match the upside-down screenshot; honoring EXIF places the signature upright at bottom right and leaves the collage text upside down. The editor previously stripped this orientation without rotating the pixels. New unsaved crops now explicitly use display orientation, while saved crops retain their existing raw coordinates. Manual quarter-turn controls persist inside the crop box and are applied before extraction in the worker. Crop handles have transparent centers. No source upload or existing artist crop was overwritten, and Intuition remains uncropped for Margaret to finish.

The product’s primary artwork area now renders the live print/frame/mat preview, with a separate link to inspect the original image. Paper frame profiles and canvas frame finishes use native dropdowns grouped by color/material. Changing profiles retains compatible mat selections. Canvas depth and mat explanations are expandable beside their controls. Artwork descriptions are under “Learn more about this artwork.”

Paper output uses at least a quarter-inch white border on all four sides, covering the larger overlap Margaret described. The purchased dimensions remain the outside paper size; all selected artwork is fitted inside without trimming or distortion. This means the visible image is slightly smaller than the paper dimensions. Canvas receives no automatic paper border. Optional white space used to fit a different aspect ratio is explained separately in the crop tool. Paid order snapshots continue using their original frozen files.

Facebook and Instagram already existed in the footer; their icon targets are now larger and easier to identify. LinkedIn is editable in site settings and validates an HTTPS linkedin.com URL. The profile ending `margaret-edmondson-724390192` matches the published CV: Savannah MFA in 2006 and Denton ISD teaching in 2020–2021. The existing Facebook URL is still awaiting owner confirmation; no alternative was guessed.

The supplied chronology was already applied. Unexpected’s 2025 tag was missing again after a later product edit and is restored by the audited content script. The database already contains the artist’s newer title “Cold Front” (2025). Image filenames are independent from artwork titles and do not need to be renamed or reuploaded.

Validation includes asymmetric-image tests for EXIF plus all four manual rotations, rotated output geometry, legacy-coordinate preservation, preview metadata, invalid orientation rejection, save/reopen persistence, main-area preview updates, mat preservation, and all four white paper edges. The full build-check includes typecheck, lint, tests, production build, and repository gates. Live checks and deployment details are recorded after publication.
