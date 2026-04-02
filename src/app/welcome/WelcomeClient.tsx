'use client'

import { Playfair_Display, DM_Sans, Caveat } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '600', '700'], style: ['normal', 'italic'], variable: '--font-playfair' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm-sans' })
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-caveat-welcome' })

export default function WelcomeClient() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // If user already dismissed the welcome letter permanently, skip straight to dashboard
    // Only skip the letter if permanently dismissed
    if (localStorage.getItem('artbyme_welcome_dismissed') === 'permanent') {
      router.replace('/admin')
      return
    }
    setReady(true)
  }, [router])

  function enterDashboard(dismissPermanently: boolean) {
    if (dismissPermanently) {
      localStorage.setItem('artbyme_welcome_dismissed', 'permanent')
    }
    // Session flag so dashboard doesn't redirect back during this tab session
    sessionStorage.setItem('artbyme_entered_from_welcome', '1')
    router.push('/admin?tutorial=1')
  }

  if (!ready) return null

  return (
    <div className={`${playfair.variable} ${dmSans.variable} ${caveat.variable}`}>
      <style jsx global>{`
        :root {
          --w-cream: #FAF6F0;
          --w-warm-white: #FFFDF9;
          --w-ink: #2C2A26;
          --w-ink-soft: #5A5650;
          --w-ink-muted: #8A857D;
          --w-terracotta: #C4724E;
          --w-sage: #7A9A82;
          --w-gold: #C9A84C;
          --w-gold-light: #E8D89A;
          --w-border: #E5DFD5;
          --w-section-bg: #F5F0E8;
        }
        .welcome-page { font-family: var(--font-dm-sans), 'DM Sans', sans-serif; background: var(--w-cream); color: var(--w-ink); line-height: 1.7; font-size: 16px; -webkit-font-smoothing: antialiased; min-height: 100vh; }
        .welcome-note { max-width: 780px; margin: 0 auto; padding: 60px 40px 80px; }

        .w-header { text-align: center; margin-bottom: 56px; padding-bottom: 48px; border-bottom: 1px solid var(--w-border); }
        .w-header-eyebrow { font-family: var(--font-caveat-welcome), 'Caveat', cursive; font-size: 22px; color: var(--w-terracotta); margin-bottom: 8px; letter-spacing: 0.5px; }
        .w-header h1 { font-family: var(--font-playfair), 'Playfair Display', serif; font-size: 38px; font-weight: 700; color: var(--w-ink); line-height: 1.2; margin-bottom: 12px; }
        .w-header h1 span { font-style: italic; color: var(--w-terracotta); }
        .w-header-sub { font-size: 17px; color: var(--w-ink-soft); max-width: 540px; margin: 0 auto; }

        .w-greeting { margin-bottom: 48px; }
        .w-greeting p { font-size: 17px; color: var(--w-ink-soft); margin-bottom: 16px; }
        .w-greeting p:first-child { font-size: 18px; color: var(--w-ink); }

        .w-section { margin-bottom: 52px; }
        .w-section-label { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-dm-sans), 'DM Sans', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--w-terracotta); margin-bottom: 14px; }
        .w-section-label::before { content: ''; display: block; width: 20px; height: 2px; background: var(--w-terracotta); }
        .w-section h2 { font-family: var(--font-playfair), 'Playfair Display', serif; font-size: 26px; font-weight: 600; color: var(--w-ink); margin-bottom: 20px; line-height: 1.3; }
        .w-section p { font-size: 16px; color: var(--w-ink-soft); margin-bottom: 16px; }

        .w-feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 28px 0; }
        .w-feature-card { background: var(--w-warm-white); border: 1px solid var(--w-border); border-radius: 12px; padding: 20px 22px; transition: transform 0.2s ease; }
        .w-feature-card:hover { transform: translateY(-2px); }
        .w-feature-icon { font-size: 22px; margin-bottom: 8px; }
        .w-feature-card h4 { font-family: var(--font-dm-sans), 'DM Sans', sans-serif; font-size: 14px; font-weight: 700; color: var(--w-ink); margin-bottom: 6px; }
        .w-feature-card p { font-size: 13.5px; color: var(--w-ink-muted); line-height: 1.55; margin-bottom: 0; }

        .w-callout { background: var(--w-section-bg); border-left: 3px solid var(--w-terracotta); border-radius: 0 12px 12px 0; padding: 24px 28px; margin: 28px 0; }
        .w-callout p { color: var(--w-ink-soft); margin-bottom: 12px; }
        .w-callout p:last-child { margin-bottom: 0; }
        .w-callout strong { color: var(--w-ink); }

        .w-funnel-cards { display: grid; grid-template-columns: 1fr; gap: 16px; margin: 28px 0; }
        .w-funnel-card { display: flex; gap: 20px; align-items: flex-start; background: var(--w-warm-white); border: 1px solid var(--w-border); border-radius: 12px; padding: 24px; }
        .w-funnel-emoji { font-size: 32px; flex-shrink: 0; margin-top: 2px; }
        .w-funnel-card h4 { font-family: var(--font-playfair), 'Playfair Display', serif; font-size: 18px; font-weight: 600; color: var(--w-ink); margin-bottom: 6px; }
        .w-funnel-card p { font-size: 14.5px; color: var(--w-ink-muted); line-height: 1.6; margin-bottom: 0; }

        .w-story-flow { margin: 28px 0; padding: 0; }
        .w-story-step { display: flex; gap: 16px; align-items: baseline; padding: 10px 0; }
        .w-story-step .arrow { color: var(--w-terracotta); font-size: 16px; flex-shrink: 0; font-weight: 600; }
        .w-story-step .label { font-weight: 700; color: var(--w-ink); }
        .w-story-step .desc { color: var(--w-ink-muted); }

        .w-domain-example { display: flex; align-items: center; gap: 16px; margin: 24px 0; flex-wrap: wrap; }
        .w-domain-pill { background: var(--w-warm-white); border: 1px solid var(--w-border); border-radius: 100px; padding: 10px 20px; font-family: var(--font-dm-sans), 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; color: var(--w-ink); }
        .w-domain-pill.accent { background: var(--w-terracotta); border-color: var(--w-terracotta); color: white; }
        .w-domain-plus { font-size: 18px; color: var(--w-ink-muted); font-weight: 600; }

        .w-why-section { background: var(--w-section-bg); border-radius: 16px; padding: 36px 32px; margin: 40px 0; }
        .w-why-section .w-section-label { color: var(--w-sage); }
        .w-why-section .w-section-label::before { background: var(--w-sage); }
        .w-why-section p { font-size: 16px; color: var(--w-ink-soft); margin-bottom: 16px; }
        .w-why-section p:last-child { margin-bottom: 0; }
        .w-friend-note { font-family: var(--font-caveat-welcome), 'Caveat', cursive; font-size: 20px; color: var(--w-terracotta); margin-top: 8px; }

        .w-remember-list { margin: 24px 0; }
        .w-remember-item { display: flex; gap: 18px; padding: 20px 0; border-bottom: 1px solid var(--w-border); }
        .w-remember-item:last-child { border-bottom: none; }
        .w-remember-num { flex-shrink: 0; width: 36px; height: 36px; background: var(--w-terracotta); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; margin-top: 2px; }
        .w-remember-item p { font-size: 15.5px; color: var(--w-ink-soft); margin-bottom: 0; }
        .w-remember-item strong { color: var(--w-ink); }

        .w-next-steps { background: var(--w-ink); border-radius: 16px; padding: 36px 32px; margin: 40px 0; }
        .w-next-steps .w-section-label { color: var(--w-gold-light); }
        .w-next-steps .w-section-label::before { background: var(--w-gold-light); }
        .w-next-steps h2 { color: var(--w-cream); }
        .w-step-list { margin-top: 20px; }
        .w-step-item { display: flex; gap: 16px; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .w-step-item:last-child { border-bottom: none; }
        .w-step-num { flex-shrink: 0; width: 32px; height: 32px; background: var(--w-terracotta); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
        .w-step-item p { font-size: 15.5px; color: rgba(250, 246, 240, 0.85); margin-bottom: 0; }
        .w-step-item a { color: var(--w-gold-light); text-decoration: none; font-weight: 600; }
        .w-step-item a:hover { text-decoration: underline; }

        .w-transition-banner { background: linear-gradient(135deg, var(--w-sage) 0%, #5C8A66 100%); border-radius: 12px; padding: 28px 32px; text-align: center; margin: 40px 0; }
        .w-transition-banner p { color: white; font-size: 16px; margin-bottom: 8px; }
        .w-transition-banner p:last-child { margin-bottom: 0; }
        .w-transition-banner strong { font-size: 18px; display: block; margin-bottom: 6px; }
        .w-transition-banner .old-portal { text-decoration: line-through; opacity: 0.6; font-size: 14px; }

        .w-sign-off { text-align: center; padding-top: 40px; border-top: 1px solid var(--w-border); margin-top: 52px; }
        .w-sign-off p { font-size: 17px; color: var(--w-ink-soft); margin-bottom: 12px; }
        .w-sign-off .names { font-family: var(--font-caveat-welcome), 'Caveat', cursive; font-size: 28px; color: var(--w-ink); }
        .w-sign-off .heart { color: var(--w-terracotta); }

        /* Navigation bar at top */
        .w-nav { position: sticky; top: 0; z-index: 50; background: rgba(250,246,240,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--w-border); padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; }
        .w-nav-brand { font-family: var(--font-playfair), 'Playfair Display', serif; font-size: 18px; font-weight: 700; color: var(--w-ink); text-decoration: none; }
        .w-nav-brand span { font-style: italic; color: var(--w-terracotta); }
        .w-nav-links { display: flex; gap: 6px; }
        .w-nav-link { font-family: var(--font-dm-sans), 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; color: var(--w-ink-soft); text-decoration: none; padding: 6px 14px; border-radius: 8px; transition: all 0.15s; }
        .w-nav-link:hover { background: rgba(0,0,0,0.04); color: var(--w-ink); }
        .w-nav-link.primary { background: var(--w-terracotta); color: white; }
        .w-nav-link.primary:hover { background: #b5654a; }

        @media (max-width: 640px) {
          .welcome-note { padding: 40px 24px 60px; }
          .w-header h1 { font-size: 30px; }
          .w-feature-grid { grid-template-columns: 1fr; }
          .w-domain-example { flex-direction: column; gap: 8px; }
          .w-funnel-card { flex-direction: column; gap: 12px; }
          .w-nav-links { gap: 4px; }
          .w-nav-link { font-size: 12px; padding: 5px 10px; }
        }
      `}</style>

      <div className="welcome-page">
        <div className="welcome-note">

          {/* ═══ HEADER ═══ */}
          <div className="w-header">
            <div className="w-header-eyebrow">Welcome to</div>
            <h1>ArtByME <span>artOS</span> 🎨</h1>
            <p className="w-header-sub">Your brand new art management and operating system.<br />We built this just for you, and we really hope you love it.</p>
          </div>

          {/* ═══ GREETING ═══ */}
          <div className="w-greeting">
            <p>Hi Margaret!</p>
            <p>We are so excited to share this with you. When this system is fully complete, you&apos;ll be able to do everything you need to effectively run your art business — all from this one place.</p>
            <p>We&apos;ve built the substantial bones for your entire art operating system. Because of that, changes from here on out can happen very quickly.</p>
          </div>

          {/* ═══ WHAT WE BUILT ═══ */}
          <div className="w-section">
            <div className="w-section-label">What We Built For You</div>
            <h2>Everything you need, one place.</h2>

            <div className="w-feature-grid">
              {[
                { icon: '🖼️', title: 'Manage Your Artwork', desc: 'Add new pieces, update prices, swap images, and organize your collections.' },
                { icon: '🛒', title: 'Run Your Online Store', desc: 'Process orders, track fulfillment through Lumaprints, Printful, and ShipStation, and manage inventory.' },
                { icon: '🎨', title: 'Handle Commissions', desc: 'Receive requests, communicate with clients, track progress, and send invoices.' },
                { icon: '📚', title: 'Teach Art Classes', desc: 'Create courses, upload lesson content, and manage student enrollments.' },
                { icon: '✍️', title: 'Write Your Blog', desc: 'Share your process, studio updates, and stories behind your pieces with a beautiful editor.' },
                { icon: '📧', title: 'Send Marketing Emails', desc: 'Newsletters, promotions, abandoned cart reminders, and welcome series — all automated.' },
                { icon: '✏️', title: 'Edit Your Website', desc: 'Swap hero images, reorder page sections, update text and CTAs — all without touching any code.' },
                { icon: '🛠️', title: 'Request Custom Changes', desc: "For anything beyond a quick swap, submit a request right from this dashboard and we'll build it with a live preview before it goes live." },
              ].map((f) => (
                <div key={f.title} className="w-feature-card">
                  <div className="w-feature-icon">{f.icon}</div>
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ HOMEPAGE DESIGNS ═══ */}
          <div className="w-section">
            <div className="w-section-label">Your Homepage</div>
            <h2>6 designs to choose from.</h2>

            <p>We built six different homepage designs for you to explore. Please click on <strong>all six</strong> and take your time with each one. Here&apos;s what we need from you:</p>

            <div className="w-callout">
              <p><strong>Which direction speaks to you the most?</strong></p>
              <p><strong>What do you love about it?</strong></p>
              <p><strong>What would you want to remove or change?</strong></p>
              <p><strong>Do you see elements in other versions that you&apos;d want to pull into your favorite?</strong></p>
            </div>

            <p>If you love the clean simplicity of one version but the handcrafted notebook-page feel of another — tell us! We can mix and match. Colors, fonts, layouts — everything can be tweaked to match your vision.</p>

            {/* Homepage preview links */}
            <div className="w-feature-grid" style={{ marginTop: 24 }}>
              {[
                { num: 1, name: 'Gallery Immersion', path: '/', desc: 'Clean, museum-quality gallery feel with elegant typography.' },
                { num: 2, name: 'Studio Energy', path: '/v2', desc: 'Bold, energetic layout with coral accents and dynamic movement.' },
                { num: 3, name: 'Immersive Collage', path: '/v3', desc: 'Handcrafted scrapbook feel with torn edges and layered textures.' },
                { num: 4, name: 'Kinetic Gallery', path: '/v4', desc: 'Modern, animated gallery with smooth scroll interactions.' },
                { num: 5, name: 'Editorial Canvas', path: '/v5', desc: 'Magazine-style editorial layout with sophisticated grid.' },
                { num: 6, name: 'Living Studio', path: '/v6', desc: 'Warm, intimate studio experience with organic flow.' },
              ].map((v) => (
                <Link key={v.num} href={v.path} target="_blank" className="w-feature-card" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                  <div className="w-feature-icon" style={{ fontSize: 14, fontWeight: 700, color: '#C4724E' }}>V{v.num}</div>
                  <h4>{v.name}</h4>
                  <p>{v.desc}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* ═══ ARTWORK FUNNELS ═══ */}
          <div className="w-section">
            <div className="w-section-label">A Powerful New Sales Tool</div>
            <h2>Artwork Funnels.</h2>

            <p>In addition to your homepage options, we&apos;ve built three funnel templates for selling individual pieces of art.</p>

            <p>Here&apos;s the idea: your shop page shows all your artwork in a grid, and visitors can click on a piece to see its product page. That works great for people already browsing your site. But what about when you want to sell a <strong>specific piece</strong> — say you just finished something you&apos;re really excited about and want to share it on Instagram, text it to a collector, or include it in an email to your list?</p>

            <p>That&apos;s what Artwork Funnels are for.</p>

            <p>Think of a funnel page as a <strong>product page on steroids</strong> — a dedicated, beautiful, single-page experience built around one piece of art. It tells the story of that piece from start to finish and guides someone from &ldquo;oh, that&apos;s interesting&rdquo; all the way to &ldquo;I need this in my home.&rdquo;</p>

            <p>Each funnel follows a storytelling structure:</p>

            <div className="w-story-flow">
              {[
                { label: 'The hook', desc: 'a stunning full-screen view that stops the scroll' },
                { label: 'The emotional connection', desc: 'why original art matters, why mass-produced prints feel empty' },
                { label: 'The story', desc: 'YOUR real story about this piece. This is the heart of the page.' },
                { label: 'The vision', desc: 'helping them imagine it on their wall, sparking conversations' },
                { label: 'The offer', desc: 'the original (if available) or prints in any size, clearly presented' },
                { label: 'The promise', desc: 'shipping and satisfaction guarantees so they buy with confidence' },
              ].map((s) => (
                <div key={s.label} className="w-story-step">
                  <span className="arrow">&rarr;</span>
                  <span><span className="label">{s.label}</span> — <span className="desc">{s.desc}</span></span>
                </div>
              ))}
            </div>

            <p>The key to making these funnel pages convert better than a regular shop page is really <strong>digging into the story behind the piece</strong>. Right now we have some story content in there, but the more personal detail you can give us about each piece — the inspiration, the process, what it means to you — the more powerful these pages become.</p>

            <div className="w-funnel-cards">
              <div className="w-funnel-card">
                <div className="w-funnel-emoji">🖼️</div>
                <div>
                  <h4>Gallery Spotlight</h4>
                  <p>Dramatic, cinematic, full-screen. The artwork fills the page like a museum installation. Great for big, bold pieces like &ldquo;Hot Air&rdquo; and &ldquo;Flower Power.&rdquo;</p>
                </div>
              </div>
              <div className="w-funnel-card">
                <div className="w-funnel-emoji">📓</div>
                <div>
                  <h4>Intimate Journal</h4>
                  <p>Warm, personal, like reading a page from your sketchbook. Paper textures, gentle flow. Perfect for your collage and encouragement series where the story and materials matter as much as the visual.</p>
                </div>
              </div>
              <div className="w-funnel-card">
                <div className="w-funnel-emoji">🎨</div>
                <div>
                  <h4>Bold Showcase</h4>
                  <p>High-energy, vibrant, contemporary. The artwork&apos;s colors bleed right into the page design. Ideal for colorful pieces like &ldquo;Road Trip&rdquo; and your animal paintings.</p>
                </div>
              </div>
            </div>

            <p>We suggest that over time we A/B/C test these funnel formats to see which ones convert best as we build traffic to your website. Since different pieces are different shapes, sizes, and styles, one template might match a specific piece better than another.</p>

            <p>Eventually, every piece of art will have <strong>both</strong> its own product/shop page <strong>and</strong> its own dedicated sales funnel page. You&apos;ll get a clean, shareable link like <strong>artbyme.studio/art/flower-power</strong> that you can post on Instagram, text to a collector, include in emails, or use in a targeted Facebook ad.</p>
          </div>

          {/* ═══ ABOUT THE NAME ═══ */}
          <div className="w-section">
            <div className="w-section-label">About the Name</div>
            <h2>ArtByME.Studio</h2>

            <p>We chose ArtByME.Studio as a fun platform name for managing your business. We needed a home for this platform, and the name works on a few levels — <strong>&ldquo;ByME&rdquo; is a play on your initials</strong> (Margaret Edmondson), but &ldquo;ME&rdquo; could also be any aspiring artist. It&apos;s a great name if you ever want to explore turning your platform into another revenue stream by licensing it to other artists and students.</p>

            <p>That said, your art website can be displayed to the world under <strong>any domain you choose</strong>. Your management platform can stay at ArtByME.Studio while your public-facing art shop could be something entirely different.</p>

            <div className="w-domain-example">
              <span className="w-domain-pill accent">ArtByME.Studio</span>
              <span className="w-domain-plus">+</span>
              <span className="w-domain-pill">MargaretEdmondsonArt.com</span>
            </div>

            <p>This is <strong>your</strong> website and <strong>your</strong> business — we&apos;ve just tried to provide you with an amazing starting point to help you see what&apos;s possible and get the creative juices flowing! If you absolutely hate &ldquo;ArtByME.Studio&rdquo; as a platform name, that&apos;s completely fine. We&apos;ll point your management platform and your art shop to any domain you want.</p>

            <div className="w-callout">
              <p>We recommend <strong><a href="https://porkbun.com" target="_blank" rel="noopener noreferrer" style={{ color: '#C4724E' }}>porkbun.com</a></strong> to buy domain names. We don&apos;t receive any kind of kickback from them — they&apos;re just a really solid, honest business with the best prices in the industry.</p>
              <p style={{ marginBottom: 0 }}><em>Weird name, good business.</em></p>
            </div>
          </div>

          {/* ═══ WHY WE BUILT THE WHOLE THING ═══ */}
          <div className="w-why-section">
            <div className="w-section-label">A Note From Us</div>
            <h2 style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 24, fontWeight: 600, color: 'var(--w-ink)', marginBottom: 20 }}>Why we went ahead and built the whole thing.</h2>

            <p>Frankly, at DotWin we specialize in ensuring that our clients are successful. These days, it&apos;s not enough to simply have a website — it gets lost in the fold. You need to be able to leverage both your presence <em>and</em> your time so that you can maximize returns on both.</p>

            <p>You needed a platform that allows you to create an experience for your visitors. You needed a place to host classes, manage commissions, analyze your sales, and streamline your delivery process through Lumaprints and Printful. As we started building for you, it became apparent that these were things you couldn&apos;t skip and still be successful.</p>

            <p>You&apos;ve become a friend over the last few years, and Skylar and I wanted to ensure that your platform is second to none. Selfishly, we hope you&apos;ll share your platform with your artist friends.</p>

            <p>We&apos;re not sure you fully realize it yet, but you now have both a website <strong>and</strong> an art business platform that you can share with your students and friends. We&apos;re happy to help them deliver their art to the world as well, and it could be a really fun and lucrative way to expand your art business.</p>

            <p>When you&apos;re ready, we&apos;ll show you how we can leverage ArtByME.Studio as the ultimate artist distribution platform to help your students and friends gain the exposure they&apos;re seeking too. 😊</p>

            <p className="w-friend-note">— from our hearts to yours</p>
          </div>

          {/* ═══ THINGS TO REMEMBER ═══ */}
          <div className="w-section">
            <div className="w-section-label">Good to Know</div>
            <h2>A few things to remember.</h2>

            <div className="w-remember-list">
              <div className="w-remember-item">
                <div className="w-remember-num">1</div>
                <p><strong>All designs, colors, and structures are preliminary.</strong> Now that the bones are built, we can iterate very quickly. Just visit a page, check it out, then hit the feedback section in your platform to let us know what you want to change. We&apos;ve built your platform to be highly customizable — don&apos;t hesitate to ask if you have an idea. We&apos;ll do our best to make it happen.</p>
              </div>
              <div className="w-remember-item">
                <div className="w-remember-num">2</div>
                <p><strong>Some functionality doesn&apos;t work yet</strong> because we need to sit down together and open a few accounts so we can complete the integrations. All the code work has been done — we simply need to set up your Lumaprints account, Stripe (payment processing), Printful, and email delivery accounts.</p>
              </div>
              <div className="w-remember-item">
                <div className="w-remember-num">3</div>
                <p><strong>There are 6 homepage variants, but everything else is uniform</strong> — gallery, shop, and product pages are the same across all versions. Once we know what kind of feel and colors you like from the homepage options, we&apos;ll update the entire platform to match — buttons, uniform pages, the works.</p>
              </div>
            </div>
          </div>

          {/* ═══ NEXT STEPS ═══ */}
          <div className="w-next-steps">
            <div className="w-section-label">Let&apos;s Go</div>
            <h2 style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Next steps.</h2>

            <div className="w-step-list">
              {[
                { num: 1, text: <>Review your <strong style={{ color: '#FAF6F0' }}>6 homepage designs</strong> — click every single one and take your time</> },
                { num: 2, text: <>Tell us which direction speaks to you — what you love, what you&apos;d change, what to mix and match</> },
                { num: 3, text: <>Browse the <strong style={{ color: '#FAF6F0' }}>3 funnel template styles</strong> and let us know your thoughts</> },
                { num: 4, text: <>Use the <strong style={{ color: '#FAF6F0' }}>feedback section</strong> in your dashboard to send us any notes</> },
                { num: 5, text: <>Once we land on your direction, we&apos;ll schedule a <strong style={{ color: '#FAF6F0' }}>setup meeting</strong> to open your integration accounts and go live 🚀</> },
              ].map((s) => (
                <div key={s.num} className="w-step-item">
                  <div className="w-step-num">{s.num}</div>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ TRANSITION BANNER ═══ */}
          <div className="w-transition-banner">
            <p><strong>Everything lives here now.</strong></p>
            <p>From now on, we&apos;ll manage your project 100% inside your platform.<br /><span className="old-portal">portal.businesses.win</span> — you don&apos;t need it anymore!</p>
          </div>

          {/* ═══ SIGN OFF ═══ */}
          <div className="w-sign-off">
            <p>This platform was designed around how you work — your art, your process, your business. Let&apos;s make it perfect.</p>
            <p className="names">— Skylar &amp; Shelby <span className="heart">&#9829;</span></p>
          </div>

          {/* ═══ ENTRY BUTTONS ═══ */}
          <div style={{ textAlign: 'center', marginTop: 48, paddingBottom: 8 }}>
            <button
              onClick={() => enterDashboard(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#C4724E', color: 'white', padding: '16px 40px', borderRadius: 12, fontSize: 16, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif', boxShadow: '0 8px 24px rgba(196,114,78,0.25)', transition: 'background 0.15s' }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              Enter Your Dashboard
            </button>
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => enterDashboard(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif', fontSize: 13, color: '#8A857D', textDecoration: 'underline', textUnderlineOffset: 3, padding: 8 }}
              >
                Enter Dashboard &amp; don&apos;t show this letter again
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
