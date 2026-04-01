import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'Meet Margaret Edmondson — mixed media artist, painter, and art educator with a BS in Art Education from Murray State and an MFA in Painting from SCAD.',
}

export default function AboutPage() {
  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-light text-charcoal">
            Meet the Artist
          </h1>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-24">
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm">
            <Image
              src="/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg"
              alt="Margaret Edmondson with award-winning cactus painting"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
          </div>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-light text-charcoal mb-6">
              Margaret Loraine Edmondson
            </h2>
            <div className="font-body text-base leading-relaxed text-charcoal/70 space-y-4">
              <p>
                Margaret grew up in a small town in Southern Illinois and discovered her love of art early. She earned her BS in Art Education from Murray State University in Murray, Kentucky in 2000, and later completed her MFA in Painting from the Savannah College of Art and Design (SCAD), commuting weekly to Georgia to pursue that dream.
              </p>
              <p>
                She met her husband Shawn their freshman year at Murray State, and over the course of their marriage they have moved out of state ten times in thirty years following his career. Along the way, Margaret worked as an interior designer in Southeast Missouri for three years and has taught art to all ages across multiple states, including Florida, Tennessee, East Texas, Northern California, North Texas, and the St. Louis and Dallas-Fort Worth areas.
              </p>
              <p>
                Now celebrating 26 years of marriage with two children in high school, Margaret continues to create and teach wherever life takes her. Her motto says it all: &ldquo;Do something creative at least once a day.&rdquo;
              </p>
              <p className="italic text-charcoal/50">
                &ldquo;Use your talents, that is what they are intended for.&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* Art Philosophy Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-24">
          <div className="order-2 lg:order-1">
            <h2 className="font-display text-2xl sm:text-3xl font-light text-charcoal mb-6">
              What You&apos;ll Find in My Work
            </h2>
            <div className="font-body text-base leading-relaxed text-charcoal/70 space-y-4">
              <p>
                &ldquo;What you will find in my artwork is the beauty of what I see around me.&rdquo; Margaret favors drawing and painting to express realism, using her camera as an initial sketch before pairing down and combining scenes by hand.
              </p>
              <p>
                Her subjects are drawn from her travels and environment: cattle, farm animals, and wild sunflowers from her years in Texas; cactus and the vivid colors of Arizona that she became obsessed with; and beach scenes from family vacations to Alabama and California.
              </p>
              <p>
                Recently, Margaret has been experimenting with textures, printmaking, text, and sewing for mixed media collages. Her Encouragement Series was a collaborative project with friend Jenny Donaldson, inspired by Rick Rubin&apos;s <em>The Creative Act: A Way of Being</em>.
              </p>
            </div>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm order-1 lg:order-2">
            <Image
              src="/Margaret Edmondson/ARTWORK/Texas Themed/Spring Break Mountain Boat Dock.jpg"
              alt="Spring Break Mountain Boat Dock painting by Margaret Edmondson"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>

        {/* Creative Process */}
        <div className="bg-white rounded-sm p-8 sm:p-12 lg:p-16 mb-24">
          <h2 className="font-display text-2xl sm:text-3xl font-light text-charcoal text-center mb-12">
            The Creative Process
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { title: 'Observe', description: 'Every piece begins with seeing. Margaret uses her camera to capture the beauty around her — landscapes, animals, light on water — as the first sketch for what comes next.' },
              { title: 'Compose', description: 'Reference photos are paired down and combined by hand, distilling multiple scenes into a single composition that captures the feeling of being there.' },
              { title: 'Create', description: 'Whether through painting, drawing, printmaking, or mixed media collage with textures, text, and sewing, Margaret brings each piece to life with warmth and attention to detail.' },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <span className="font-hand text-4xl text-gold">{i + 1}</span>
                <h3 className="mt-2 font-display text-xl font-light text-charcoal">{step.title}</h3>
                <p className="mt-2 font-body text-sm text-charcoal/60">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Gallery Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { src: '/Margaret Edmondson/ARTWORK/Encouragement Series/Unexpected.jpg', alt: 'Unexpected — from the Encouragement Series' },
            { src: '/Margaret Edmondson/ARTWORK/Texas Themed/Spring Break Mountain Boat Dock.jpg', alt: 'Spring Break Mountain Boat Dock' },
            { src: '/Margaret Edmondson/ARTWORK/Beach and SC/Road Trip.jpg', alt: 'Road Trip — beach scene painting' },
            { src: '/Margaret Edmondson/ARTWORK/Cactuses/Hot Air_1.jpg', alt: 'Hot Air — cactus series painting' },
          ].map((img, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-sm">
              <Image src={img.src} alt={img.alt} fill className="object-cover" sizes="25vw" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
