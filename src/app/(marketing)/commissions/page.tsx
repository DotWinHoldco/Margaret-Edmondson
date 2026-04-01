import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Commissions',
  description: 'Commission a custom pet portrait or house portrait by Margaret Edmondson. Acrylic, watercolor, pastel, charcoal, and mixed media options available.',
}

const STEPS = [
  { num: 1, title: 'Inquire', desc: 'Reach out with your vision, reference photos, preferred medium, and size. Margaret will discuss your ideas and provide a personalized quote.' },
  { num: 2, title: 'Deposit & Begin', desc: 'A 50% deposit secures your spot. Margaret begins work after agreement and reference images are received.' },
  { num: 3, title: 'Creation', desc: 'Your piece comes to life in the studio. Expect 2 to 8 weeks depending on complexity, with progress photos along the way.' },
  { num: 4, title: 'Delivery', desc: 'Final payment upon completion, professional packaging, and shipping straight to your door. Your story, on your walls.' },
]

const PET_MEDIA = [
  'Acrylic',
  'Watercolor',
  'Water Gouache',
  'Pastel',
  'Charcoal',
  'Mixed Media',
]

export default function CommissionsPage() {
  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-light text-charcoal">
            Custom Commissions
          </h1>
          <div className="mt-3 mx-auto w-16 h-px bg-gold" />
          <p className="mt-4 font-body text-lg text-charcoal/60 max-w-2xl mx-auto">
            A one-of-a-kind piece created just for you. Pet portraits, house portraits, and more — each made with care from your reference photos.
          </p>
        </div>

        {/* Example Work */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-20">
          {[
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_1.jpg', alt: 'Custom pet portrait example' },
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_2.jpg', alt: 'Custom pet portrait example' },
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom House Portrait Example_1.jpg', alt: 'Custom house portrait example' },
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom House Portrait Example_2.jpg', alt: 'Custom house portrait example' },
          ].map((img, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-sm">
              <Image src={img.src} alt={img.alt} fill className="object-cover" sizes="25vw" />
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div className="mb-20">
          <h2 className="font-display text-2xl sm:text-3xl font-light text-charcoal text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((step) => (
              <div key={step.num} className="text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 font-hand text-2xl text-teal">
                  {step.num}
                </span>
                <h3 className="mt-4 font-display text-lg font-light text-charcoal">{step.title}</h3>
                <p className="mt-2 font-body text-sm text-charcoal/60">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing: Pet Portraits */}
        <div className="bg-white rounded-sm p-8 sm:p-12 mb-10">
          <h2 className="font-display text-2xl font-light text-charcoal text-center mb-3">
            Pet Portraits
          </h2>
          <p className="font-body text-sm text-charcoal/60 text-center max-w-xl mx-auto mb-8">
            Capture the personality of your furry, feathered, or four-legged family member. Provide reference photos, choose your preferred medium, and Margaret will bring them to life.
          </p>

          <div className="max-w-lg mx-auto space-y-3 mb-6">
            <div className="flex justify-between items-center py-3 border-b border-charcoal/5">
              <span className="font-body text-sm text-charcoal/70">Starting price</span>
              <span className="font-body text-sm font-semibold text-charcoal">$250 minimum</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-charcoal/5">
              <span className="font-body text-sm text-charcoal/70">Timeline</span>
              <span className="font-body text-sm font-semibold text-charcoal">2 – 8 weeks</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-charcoal/5">
              <span className="font-body text-sm text-charcoal/70">Deposit</span>
              <span className="font-body text-sm font-semibold text-charcoal">50% upfront</span>
            </div>
          </div>

          <div className="max-w-lg mx-auto">
            <p className="font-body text-xs text-charcoal/50 mb-2 uppercase tracking-wider">Available Media</p>
            <div className="flex flex-wrap gap-2">
              {PET_MEDIA.map((medium) => (
                <span key={medium} className="inline-block px-3 py-1 bg-charcoal/5 rounded-full font-body text-xs text-charcoal/70">
                  {medium}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing: House Portraits */}
        <div className="bg-white rounded-sm p-8 sm:p-12 mb-10">
          <h2 className="font-display text-2xl font-light text-charcoal text-center mb-3">
            House Portraits
          </h2>
          <p className="font-body text-sm text-charcoal/60 text-center max-w-xl mx-auto mb-8">
            A beautiful keepsake of a home that holds special memories. Watercolor is the preferred medium for house portraits. Provide photos of the home and Margaret will create a warm, detailed rendering.
          </p>

          <div className="max-w-lg mx-auto space-y-3 mb-6">
            <div className="flex justify-between items-center py-3 border-b border-charcoal/5">
              <span className="font-body text-sm text-charcoal/70">Price range</span>
              <span className="font-body text-sm font-semibold text-charcoal">$150 – $500</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-charcoal/5">
              <span className="font-body text-sm text-charcoal/70">Preferred medium</span>
              <span className="font-body text-sm font-semibold text-charcoal">Watercolor</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-charcoal/5">
              <span className="font-body text-sm text-charcoal/70">Deposit</span>
              <span className="font-body text-sm font-semibold text-charcoal">50% upfront</span>
            </div>
          </div>

          <p className="text-center font-body text-xs text-charcoal/40">
            Final price depends on complexity, size, and detail. A personalized quote is provided after consultation.
          </p>
        </div>

        {/* More Examples */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-20">
          {[
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Custom Pet Portrait Example_3.jpg', alt: 'Custom pet portrait example' },
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Dog and Daughter Drawing_1.jpg', alt: 'Dog and daughter drawing commission' },
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Family Gift Painting.jpg', alt: 'Family gift painting commission' },
            { src: '/Margaret Edmondson/ARTWORK/Custom Portrait Options/Stylized Color Portrait Example.jpg', alt: 'Stylized color portrait example' },
          ].map((img, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-sm">
              <Image src={img.src} alt={img.alt} fill className="object-cover" sizes="25vw" />
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/commissions/request"
            className="inline-flex items-center justify-center px-10 py-4 bg-teal text-white font-body text-sm font-medium tracking-wider uppercase rounded-sm hover:bg-teal/90 transition-colors"
          >
            Start Your Commission
          </Link>
        </div>
      </div>
    </div>
  )
}
