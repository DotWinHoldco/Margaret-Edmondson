import { ctaButton } from './shell'

/** A review invitation for the existing opt-out-aware post-purchase studio note. */
export function reviewInvitation(): string {
  const url = 'https://artbyme.studio/reviews#share'
  return `<div style="border-top:1px solid #e5e0d8;margin-top:28px;padding-top:24px;text-align:center;">
    <h2 style="font-size:20px;font-weight:400;">Art, in your home.</h2>
    <p style="color:#555;font-size:14px;line-height:1.7;">Once your artwork has arrived, I would love to hear what you think. Please share a review and, if you like, a photo of the piece in your home.</p>
    ${ctaButton(url, 'Share Your Review')}
    <a href="${url}"><img src="https://artbyme.studio/review-qr.png" width="140" height="140" alt="Scan to open the ArtByME review form" style="display:block;margin:0 auto;border:0;" /></a>
    <p style="font-size:12px;color:#666;">Tap the button or scan the code. Reviews appear after approval.</p>
  </div>`
}
