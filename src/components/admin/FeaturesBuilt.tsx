import Link from 'next/link'
import { featuresBuilt } from '@/lib/admin/features-built'

/** Native details keeps this reference out of the way until the owner opens it. */
export default function FeaturesBuilt() {
  return (
    <details id="features-built" className="group scroll-mt-6 rounded-lg border border-charcoal/10 bg-white">
      <summary className="cursor-pointer px-6 py-5 marker:text-teal">
        <span className="ml-1 font-display text-xl text-charcoal">Features built</span>
        <span className="ml-3 font-body text-sm text-charcoal/55">Open the platform guide</span>
      </summary>
      <div className="border-t border-charcoal/10 px-6 pb-6 pt-4">
        <p className="max-w-3xl font-body text-sm leading-relaxed text-charcoal/65">
          A quick reference to the tools in your studio. Open a link to use a tool, or read Help and Guides for the steps. Some features need saved settings or a connected service before you can use them.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {featuresBuilt.map(feature => (
            <section key={feature.title} className="rounded-lg border border-charcoal/10 bg-cream/30 p-4">
              <h3 className="font-body text-sm font-semibold text-charcoal">{feature.title}</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-charcoal/65">{feature.description}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {feature.links.map(link => <Link key={link.href} href={link.href} className="font-body text-sm font-medium text-teal underline underline-offset-4 hover:text-deep-teal">{link.label}</Link>)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </details>
  )
}
