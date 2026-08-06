-- Ten launch posts for the ArtByME blog. SEO targets: DFW art
-- classes, custom artwork commissions, custom art prints, animal
-- and pet art prints, Texas landscape originals, plus brand SEO
-- for artbyme.studio and Margaret Edmondson.
--
-- Voice: third-person editorial. Biographical claims are drawn
-- from the published bio at /public/Margaret Edmondson/.
-- Idempotent — on conflict (slug) do nothing.

insert into public.blog_posts
  (title, slug, excerpt, content_html, content_json, tags, seo_title, seo_description, status, published_at)
values
(
  'Paint Your Pet Classes in DFW: What to Expect Your First Time',
  'paint-your-pet-classes-dfw',
  'A two-hour Paint Your Pet class in the DFW area, taught by Margaret Edmondson. What to bring, what is provided, and what you will leave with.',
  $body$
<p>Paint Your Pet classes have become one of the most popular ways to spend an evening in the Dallas-Fort Worth area. Margaret Edmondson hosts hers in the Harvest community (Argyle / Justin / Northlake area), and a lot of her students walk in saying the same thing: "I haven't painted since middle school." Two hours later they leave with a finished canvas of their dog, cat, horse, or bird that they are genuinely proud of.</p>
<h2>What the class is</h2>
<p>Each session is a small group, capped at ten people, focused on a single goal: a finished pet portrait you take home that night. Margaret prepares a custom outline of your pet on the canvas before class begins (which is why pet photos are due at least two weeks before the date). You spend the two hours layering color over a structure that is already correct, which is how beginners produce work that actually looks like their pet.</p>
<h2>Who shows up</h2>
<p>The adult classes mix first-time painters with people who paint occasionally and want a guided afternoon. The teen and kids classes are popular for birthdays and bring-a-friend nights. No one is expected to know what they are doing. The point of the class is not to be a painter already, it is to walk out with a piece of your pet you would actually hang.</p>
<h2>What is included</h2>
<ul>
<li>All paint, brushes, and a pre-stretched canvas with your pet sketched on it</li>
<li>Margaret's guided instruction step by step</li>
<li>A relaxed two hours at <strong>The Farmhouse coffee shop in Harvest</strong>, the host venue</li>
<li>Your finished canvas to take home that evening</li>
</ul>
<h2>What you bring</h2>
<p>A clear, well-lit photo of your pet, uploaded when you reserve your spot. That photo becomes the reference for the custom outline. The earlier you send it, the more time Margaret has to prep.</p>
<h2>How to book</h2>
<p>Reservations open on the <a href="/classes">classes page</a>. Adult sessions, teen sessions, and kids sessions are listed separately. Most fill within a week of opening, so the studio list newsletter is the easiest way to hear about new dates first.</p>
$body$,
  '{}'::jsonb,
  array['classes','paint-your-pet','dfw','beginner-painting'],
  'Paint Your Pet Classes in DFW | ArtByME',
  'What to expect at a Paint Your Pet class in the Dallas-Fort Worth area. Two hours, all supplies, a finished pet portrait you take home that night.',
  'published',
  now()
),
(
  'How to Commission a Custom Pet Portrait: A Step-by-Step Guide',
  'commission-custom-pet-portrait-guide',
  'A walkthrough of how a custom pet portrait commission works at ArtByME, from inquiry to final painting in your hands.',
  $body$
<p>A custom pet portrait is a different kind of gift. It is not pulled from a catalog and printed on demand, it is painted from your photos, by hand, by a single artist. If you have never commissioned art before, the process can feel opaque. Here is exactly how it works at ArtByME.</p>
<h2>1. Inquire</h2>
<p>The <a href="/commissions/request">commission request form</a> asks for your name, a short description of what you are imagining, your preferred medium (watercolor, acrylic, pastel, charcoal, or mixed media), an approximate size, your timeline, and reference photos of the pet. Margaret reviews every inquiry personally and replies with a quote and a realistic timeline, usually within two business days.</p>
<h2>2. Deposit and approval</h2>
<p>Once you approve the quote, a 50% deposit secures the slot in the studio queue. Margaret works one piece at a time, so confirming the deposit gets you on the calendar in order.</p>
<h2>3. Creation</h2>
<p>Most pet portraits take two to eight weeks, depending on size and complexity. You will get progress photos as the piece develops, usually one at the sketch stage, one mid-way, and one before final detail work. If something is not landing the way you hoped, the early-stage photos are the time to say so.</p>
<h2>4. Final payment and delivery</h2>
<p>Final payment is due at completion. The piece is professionally packaged, corner-protected, wrapped, and shipped insured in a sturdy box or custom crate for larger works. Shipping is included in the contiguous US.</p>
<h2>What makes a good reference photo</h2>
<ul>
<li>Natural light, ideally outdoors or near a window. Avoid camera flash.</li>
<li>The pet at their normal eye level, not shot from far above</li>
<li>Sharp focus on the face, especially the eyes</li>
<li>Multiple angles if you have them — Margaret often combines two photos into one composition</li>
</ul>
<h2>How much it costs</h2>
<p>Pet portraits start at $250 and scale with size and medium. Watercolor on paper and ink line work tend to be the most accessible; mixed media on large canvas runs higher. Margaret quotes every piece individually after seeing your reference photos.</p>
$body$,
  '{}'::jsonb,
  array['commissions','custom-art','pet-portraits','buying-art'],
  'How to Commission a Custom Pet Portrait | ArtByME',
  'A step-by-step guide to commissioning a custom pet portrait by Margaret Edmondson — inquiry, quote, deposit, creation, delivery. Pricing and timeline explained.',
  'published',
  now()
),
(
  'Why Custom Canvas Prints Beat Mass-Produced Wall Art (Every Time)',
  'custom-canvas-prints-vs-mass-produced',
  'When a piece of wall art comes from a real studio, it carries a specific story. Why custom canvas prints of original artwork hold up where generic decor falls flat.',
  $body$
<p>Big-box wall art does one job well: it fills space cheaply. The problem is that filling space is the only job it does. The piece is identical in ten thousand other living rooms, the colors are tuned for mass appeal, and the artist's name (if there is one) means nothing because no story attaches to it.</p>
<p>Custom canvas prints of original artwork sit in a different category. The print is still affordable — canvas prints from ArtByME start well below the price of an original — but the piece itself has a real source. Someone painted it. The composition, the color choice, the brushwork came from a specific studio and a specific year.</p>
<h2>Three reasons originals scale better</h2>
<h3>The piece has a story you can repeat</h3>
<p>"I bought a print of a saguaro cactus that the artist watched while she was driving through Arizona." That is a better dinner-table line than "I got it at Home Goods." A custom print holds the source, the year, and the artist's hand. Mass art does not.</p>
<h3>The color is calibrated for the painting, not for a category</h3>
<p>Generic wall art is color-corrected for an aesthetic — coastal, farmhouse, mid-century. Custom prints of original work carry the artist's exact palette, including the strange ones (a coral that should not work, a green that catches the eye exactly because it is too saturated for the rest of the piece).</p>
<h3>Resale and longevity actually exist</h3>
<p>Original artwork and limited prints from a working artist can hold or grow value over time. Mass-produced wall decor does not. If you have ever tried to resell a Target canvas you know it cannot be done.</p>
<h2>What ArtByME prints are made of</h2>
<p>Every canvas print at <a href="/">artbyme.studio</a> is produced on demand by a professional fulfillment partner on museum-quality canvas with archival inks. Framed canvas options ship ready to hang. Browse the <a href="/shop">shop</a> to see the current catalog.</p>
$body$,
  '{}'::jsonb,
  array['prints','canvas-art','buying-art','home-decor'],
  'Custom Canvas Prints vs. Mass Wall Art | ArtByME',
  'Why custom canvas prints of original artwork hold up where generic wall decor falls flat. Story, color, and value compared.',
  'published',
  now()
),
(
  'Animal Art Prints for the Home: Choosing the Right Piece for Your Space',
  'animal-art-prints-choosing-the-right-piece',
  'How to pick an animal art print that actually fits the room — by scale, by light, by subject, and by what you want the wall to feel like.',
  $body$
<p>Animal art prints are one of the most-bought categories in fine-art e-commerce, and one of the most-returned, because most buyers pick on subject alone (I love dogs, this is a dog) and ignore the four variables that actually determine whether the piece works on the wall.</p>
<h2>Scale</h2>
<p>The biggest single mistake is buying a print that is too small. A 12x16 canvas above a 72-inch couch reads as a sticky note. Rule of thumb for a single piece above furniture: the artwork should be between two-thirds and three-quarters of the furniture's width. A grouping of two or three smaller prints can hit the same target. Measure the wall and tape the rectangle out before you order.</p>
<h2>Light</h2>
<p>South- and west-facing walls get direct afternoon sun. Pieces with heavy black or saturated red darken and warp visually in that light, and dyes (not pigments) fade. Archival pigment canvas prints — what ArtByME uses — hold up well, but you still want lighter palettes on the bright walls and your moodier pieces on the cooler interior walls.</p>
<h2>Subject relationship</h2>
<p>If the piece is in a room with other animal pieces, vary the species. Three different dogs starts to feel like a kennel; a dog, a horse, and a meadowlark feels like a curated collection. If the wall is in the bedroom, lean toward quiet animals (sleeping cat, grazing horse). Kitchens and family rooms can handle high-energy compositions.</p>
<h2>Personal connection</h2>
<p>The animal art that ages well in your home is almost always the piece you have a real reason to own. A breed you grew up with. The state where the species lives. The bird that visits your feeder. Buying purely on cuteness is fine for prints; for anything you plan to live with for years, the story matters more than the surface.</p>
<h2>What is in the catalog</h2>
<p>ArtByME prints include Margaret''s Texas-themed cattle and donkey pieces ("Paintin'' the Ass" being a perennial favorite), the dog and pet portrait line, and the bird studies from her field sketchbook work. Browse the <a href="/shop">shop</a> by subject or filter by medium.</p>
$body$,
  '{}'::jsonb,
  array['prints','animal-art','home-decor','buying-art'],
  'Animal Art Prints for the Home: How to Choose | ArtByME',
  'How to pick an animal art print that actually fits the room — scale, light, subject, and connection. A practical guide for first-time buyers.',
  'published',
  now()
),
(
  'Texas Landscape Originals: The Story Behind Cattle, Cactus, and Wild Sunflowers',
  'texas-landscape-originals-cattle-cactus-sunflowers',
  'The Texas, Arizona, and Carolina coast pieces in the ArtByME catalog all started somewhere specific. Where each series came from.',
  $body$
<p>Most landscape painters paint where they live. Margaret Edmondson has lived in ten states across thirty years (Southern Illinois, Kentucky, Missouri, Florida, Georgia, Tennessee, East Texas, Northern California, North Texas, St. Louis, and now back to the Dallas-Fort Worth area), and the landscape work in her catalog reflects all of it. Three locations dominate the current shop, and each has a distinct origin.</p>
<h2>Texas: cattle and wild sunflowers</h2>
<p>Once she settled in North Texas, what caught her eye were the things people who live here stop noticing — Hereford cattle in mid-summer light, the wild sunflowers that grow along highway construction zones, and the longears (donkeys) that show up as comic relief in pastoral compositions. The Texas pieces, including the cattle series and "Paintin'' the Ass," tend to run a warmer palette than her earlier work and use water gouache for the field grass.</p>
<h2>Arizona: saguaro cactus</h2>
<p>The Arizona work came from two short side trips, not from living there. The pieces are about a specific moment when a non-resident registers what the desert palette actually does — the blue-violet mountains along every horizon line, the sage green of saguaros that is somehow correct against a sky that should not allow it. The Arizona series is watercolor-heavy because the medium does the desert sky in a way acrylic struggles to.</p>
<h2>Carolina coast and Alabama beaches</h2>
<p>The beach scenes come from family vacations to Alabama and California, and more recently from time spent on the South Carolina coast. The coastal pieces use the most space-and-scale composition of any of her work — long horizons, small figures, deliberately under-populated beaches. They read well at larger sizes; the figures only land in a piece big enough to give them room.</p>
<h2>Originals vs. prints</h2>
<p>Each original is one of one. Once it is sold it is no longer available. Canvas prints of select landscapes are produced on demand on museum-quality canvas with archival inks; the print catalog rotates seasonally. Browse the <a href="/shop">shop</a> for current availability.</p>
$body$,
  '{}'::jsonb,
  array['originals','landscape','texas','arizona','behind-the-work'],
  'Texas Landscape Originals & Series | ArtByME',
  'The story behind Margaret Edmondson''s Texas cattle and sunflower series, Arizona saguaro studies, and Carolina coast pieces.',
  'published',
  now()
),
(
  'Seven Beginner Painting Tips from a Working Artist with an MFA',
  'beginner-painting-tips-from-a-working-artist',
  'Seven practical painting tips for adults who have not painted since high school. Drawn from years of teaching ages eight to seventy in classroom and studio.',
  $body$
<p>Most adults stop painting around the same age — middle school, give or take a year. They picked it back up later because of a class, a kid''s birthday party, or pure curiosity, and the first session always surfaces the same handful of problems. Here is the short list, from someone who has taught painting since 2013.</p>
<h2>1. Sketch the structure first, even if the medium is paint</h2>
<p>Most "I can't paint" frustration is actually "I can't draw," and most drawing issues are issues of proportion that a five-minute pencil sketch on the canvas solves before paint touches the surface.</p>
<h2>2. Paint with the brush, not with the wrist</h2>
<p>Beginners hold a paintbrush like a pen and move from the wrist. Move from the shoulder and elbow for big strokes, the wrist only for detail. The looser line is the goal.</p>
<h2>3. Mix more than you think you need</h2>
<p>Running out of a custom-mixed color halfway through a piece is the most common reason adult-class paintings start fighting themselves. Mix double what you think you need every time you mix.</p>
<h2>4. Work in layers, not in one pass</h2>
<p>Block in the entire composition with thin underpainting before any detail. Once the values are right at the underpainting stage, the final pass is mostly applying surface color.</p>
<h2>5. Step back every five minutes</h2>
<p>Hold the painting at arm''s length, walk six feet away, look at it. Problems show up at viewing distance that disappear when your nose is six inches from the canvas.</p>
<h2>6. Edges are 80% of "looking professional"</h2>
<p>Sharp, deliberate edges where the subject meets the background read as "well painted" to most viewers even when the interior of the subject is rough. Soft edges everywhere reads as "unfinished."</p>
<h2>7. Sign every piece, including the bad ones</h2>
<p>Signing the rough early work is how you accept that a body of work includes both ends of the bell curve. The rough early pieces are the evidence of practice; without them, the good ones did not happen either.</p>
<h2>If you want hands-on coaching</h2>
<p>Margaret runs <a href="/classes">small-group painting classes in DFW</a> for adults, teens, and kids, with all supplies provided. Most students leave with a finished canvas after two hours.</p>
$body$,
  '{}'::jsonb,
  array['tips','beginner','classes','painting'],
  'Seven Beginner Painting Tips from a Working Artist | ArtByME',
  'Seven practical painting tips for adults who haven''t painted since high school. From an MFA-trained artist who has taught painting since 2013.',
  'published',
  now()
),
(
  'How to Buy Original Art Online Without Getting Burned',
  'how-to-buy-original-art-online',
  'Buying original art online is mostly trustworthy, but the failure modes are predictable. Six checks to run before you click buy.',
  $body$
<p>Buying original art from an artist''s own website is one of the most direct ways to acquire a piece — no gallery markup, no auction-house fees, and the conversation goes straight from buyer to studio. It is also the channel where a small number of buyers occasionally get burned, almost always for the same reasons. Six checks before you spend.</p>
<h2>1. Verify the artist exists</h2>
<p>A working artist has more than a single website. Look for: a real CV with dated exhibitions, a teaching history, gallery representation past or present, social presence with a multi-year archive. ArtByME''s <a href="/cv">CV page</a> lists the artist''s MFA from SCAD, BS Art Education from Murray State, and an exhibition record going back over a decade.</p>
<h2>2. Confirm "original" actually means original</h2>
<p>Some sites use "original" to mean "an original print of a digital file." A real original has a single physical existence. The product page should say so explicitly — "one of one," "original on canvas," etc. — and the price will reflect it (originals run multiples of print prices).</p>
<h2>3. Check the photography honesty</h2>
<p>Multiple angle photos, at least one with a hand or ruler for scale, and a photo of the piece in a room is a good sign. Single front-on shot only, especially without a scale reference, often means the studio is hiding something — frame condition, brush stroke depth, or the actual size relative to the description.</p>
<h2>4. Read the returns policy before you commit</h2>
<p>Reputable studios accept returns within a window (ArtByME accepts originals within 14 days of delivery if damaged or significantly different from the listing). "All sales final" on a piece you have only seen in photos is a red flag.</p>
<h2>5. Look for insured shipping</h2>
<p>An original is irreplaceable. Insured shipping at full purchase price should be standard, not a paid upgrade. Custom crating for larger pieces should be available if needed.</p>
<h2>6. Buy from the studio, not a marketplace reseller</h2>
<p>Going direct (artbyme.studio in our case) means the artist gets paid in full, you get the artist''s actual packaging and certificate, and any commission-style follow-up requests are easy. Marketplace resellers add a layer and remove the relationship.</p>
<h2>What ArtByME does</h2>
<p>Every original is one of one, hand-packaged by Margaret herself with corner protection, wrapped in protective material, and shipped insured for the full purchase price in the contiguous US. See the <a href="/shipping-policy">shipping policy</a> and <a href="/tos">terms</a> for specifics.</p>
$body$,
  '{}'::jsonb,
  array['buying-art','originals','consumer-guide'],
  'How to Buy Original Art Online Without Getting Burned | ArtByME',
  'Six checks before buying original art online: artist verification, what original actually means, photo honesty, returns, insured shipping, going direct.',
  'published',
  now()
),
(
  'Mixed Media Collage: Layering Paper, Paint, and Stitch',
  'mixed-media-collage-paper-paint-stitch',
  'Mixed media collage is the most-asked-about technique in the ArtByME catalog. A behind-the-work look at the materials and the order of operations.',
  $body$
<p>Mixed media collage is the most asked-about technique in Margaret Edmondson''s catalog — pieces in the Encouragement Series like "Unexpected" pull paper, music, magazine, tissue, watercolor, pastel, and thread into a single composition, and the surface is the first question every collector has. Here is the order of operations.</p>
<h2>The substrate</h2>
<p>Most pieces start on heavy watercolor paper (300 lb cold press) or stretched canvas if the piece is large enough to need it. Light weights cockle when wet collage materials soak in.</p>
<h2>The first pass</h2>
<p>A loose watercolor or acrylic wash sets the temperature of the piece. Warm or cool, light or saturated, the wash determines everything that gets layered on top. Margaret often does this in one continuous sitting — the layer underneath sets the constraint for everything that follows.</p>
<h2>Found paper layer</h2>
<p>Vintage book pages, music sheets, magazine cuts, tissue, sewing patterns. The cut shapes go down with matte medium. The trick is varying the opacity — full opaque paper anchors a region, tissue gives a translucent veil that lets the underpainting show through.</p>
<h2>Pastel and pencil rebuild</h2>
<p>After the paper layer dries, soft pastel and graphite rebuild the drawing on top. This is where the subject re-emerges — usually a figure, a flower, or a script word — out of what looks like chaos a layer earlier.</p>
<h2>Stitch as accent</h2>
<p>Hand stitching adds a physical surface that no flat technique can match. A single line of running stitch in cotton or silk thread, often outlining a figure or accenting a horizon, makes the piece sculptural in a way that reads even at six feet of viewing distance.</p>
<h2>Sealing</h2>
<p>Mixed media on paper is mounted on board or floated in a deep frame. Acrylic varnish on canvas pieces, archival fixative on the paper ones. Mounted, the work travels and lives like an original painting.</p>
<h2>Why the technique works</h2>
<p>Mixed media collage allows what a single medium does not: an unfinished feeling that is the point of the piece. The composition is built and revealed in passes, not in one go. For collectors, the surface itself is the value — no print can reproduce real stitched thread.</p>
<p>Mixed media originals are listed individually in the <a href="/shop">shop</a> and rotate frequently. Commissions in mixed media are quoted case by case via the <a href="/commissions/request">commission form</a>.</p>
$body$,
  '{}'::jsonb,
  array['mixed-media','process','originals','behind-the-work'],
  'Mixed Media Collage: Paper, Paint, Stitch | ArtByME',
  'Behind the technique: how Margaret Edmondson layers watercolor, found paper, pastel, and stitch into a single mixed media collage.',
  'published',
  now()
),
(
  'Five Reasons to Take an Art Class as an Adult',
  'why-take-an-art-class-as-an-adult',
  'Most adults stopped painting in middle school. Five concrete reasons to pick a brush back up, including the ones nobody puts on a flyer.',
  $body$
<p>The Paint Your Pet sessions at ArtByME fill mostly with adults who say a version of the same sentence: "I haven''t painted since high school." Here are five reasons to take a class anyway, including a couple nobody puts on the marketing flyer.</p>
<h2>1. The instruction shortcuts the years it would take to figure out alone</h2>
<p>An MFA-trained artist watching you paint catches in five minutes what you would correct on your own over five years. The technical adjustments (how to load a brush, where to start a wash, when to stop) are not the kind of thing you can learn from a YouTube video — someone has to see your hand move.</p>
<h2>2. It is a non-screen activity for two hours</h2>
<p>Most adult evenings are screens, dinner, screens again. A painting class is two hours of mixing colors, watching what the brush does, talking to other adults in the same boat. The afterglow lasts longer than any of the screen alternatives.</p>
<h2>3. You leave with something physical</h2>
<p>You can take a yoga class for a year and have nothing to show for it. You can take one painting class and walk out with a canvas of your dog that ends up on your wall. The bias toward making a thing — and finishing it that night — is itself the value.</p>
<h2>4. It rewires the "I can't draw" story</h2>
<p>"I can't draw" is usually true at twelve. By thirty-five, with two hours of guided instruction on a structured surface, it is no longer true. Sitting with that update — the version of you that can in fact make something that looks like the photo — is more than a creative breakthrough. It is a small adjustment to the broader catalog of things you have decided you cannot do.</p>
<h2>5. It is a date night that is not a restaurant</h2>
<p>Couples register together a lot. The class has a built-in conversation (your painting, their painting, the music playing, the dog you brought a photo of) without the awkward silence of a long restaurant dinner. The finished pair of canvases ends up on the same wall.</p>
<h2>Where to take one in DFW</h2>
<p>Margaret hosts small-group Paint Your Pet classes for adults, teens, and kids at <strong>The Farmhouse coffee shop in Harvest</strong> (Argyle / Justin / Northlake). Reserve a spot from the <a href="/classes">classes page</a>.</p>
$body$,
  '{}'::jsonb,
  array['classes','adult-learning','dfw'],
  'Why Take an Art Class as an Adult | ArtByME',
  'Five reasons to take a painting class as an adult, including the ones nobody puts on the flyer. Paint Your Pet sessions hosted in DFW.',
  'published',
  now()
),
(
  'Margaret Edmondson at a Glance: Texas, Arizona, the Carolina Coast, One Studio',
  'margaret-edmondson-artist-overview',
  'Who Margaret Edmondson is, what she paints, where she shows, and how the studio operates. The short version of the bio for first-time visitors to artbyme.studio.',
  $body$
<p>Most visitors to <a href="/">artbyme.studio</a> arrive on a product page first and never read the full bio. Here is the short version.</p>
<h2>Who</h2>
<p>Margaret Loraine (Byassee) Edmondson. BS Art Education, Murray State University, 2000. MFA in Painting, Savannah College of Art and Design (SCAD), 2006. She has been teaching painting since 2013, across multiple states and through several home relocations, and is currently based in the Dallas-Fort Worth area.</p>
<h2>What</h2>
<p>Mixed media, paintings, and collage. Originals in watercolor, acrylic, water gouache, pastel, and combined-media collages. Canvas prints and framed canvas prints of selected works are produced on demand on museum-quality archival canvas. Custom commissions (pet portraits, house portraits, custom subjects) are quoted individually.</p>
<h2>Subjects</h2>
<ul>
<li><strong>Texas</strong> — cattle, longears (donkeys), wild sunflowers, farm animals, fields</li>
<li><strong>Arizona</strong> — saguaro cactus studies, desert palette, blue-violet horizons</li>
<li><strong>Coastal</strong> — Carolina coast and Gulf-coast beach scenes with deliberately small figures and long horizons</li>
<li><strong>Mixed media collage</strong> — the Encouragement Series, where paper, paint, stitch, and text combine</li>
<li><strong>Pets</strong> — commissioned portraits and the studio''s bestselling print line</li>
</ul>
<h2>Classes</h2>
<p>Small-group Paint Your Pet classes for adults, teens, and kids, hosted at The Farmhouse coffee shop in Harvest (DFW). All supplies provided. Students leave with a finished canvas that night.</p>
<h2>Studio</h2>
<p>The studio operates direct-to-collector: the website is the catalog, the studio packs and ships every original by hand, and every commission goes through Margaret personally. There is no gallery layer, no marketplace reseller in the loop, and no automated approval queue between buyer and artist.</p>
<h2>How to follow the work</h2>
<p>The fastest way to see new pieces, upcoming shows, and class dates is the Studio List Newsletter (every form on the site joins you to it, including the footer). The <a href="/blog">blog</a> covers technique, behind-the-work pieces, and the occasional buying guide. The <a href="/cv">CV</a> has the full exhibition history.</p>
$body$,
  '{}'::jsonb,
  array['about','brand','artist-profile'],
  'About Margaret Edmondson | ArtByME',
  'Who Margaret Edmondson is, what she paints, where she shows, and how the ArtByME studio operates. A short orientation for new visitors.',
  'published',
  now()
)
on conflict (slug) do nothing;
