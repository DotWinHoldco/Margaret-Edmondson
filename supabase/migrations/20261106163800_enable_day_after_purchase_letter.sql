-- Authored by DotWin. Apply after the delayed-mail worker is deployed.
update public.email_automation_steps set
  delay_minutes = 1440,
  subject = 'A personal thank-you from Margaret — Art By ME',
  preheader = 'Thank you for supporting my art. Enjoy 10% off your next order.',
  promo_percent_off = 10,
  promo_expires_in_hours = 720,
  content_html = $letter$
<div style="font-size:16px;line-height:1.8;">
  <p>Dear {{patron_name}},</p>
  <p>Thank you so much for choosing <strong>Art By ME</strong> for your artwork order! I truly appreciate your trust and support, and I hope you’ll love your new piece of art as much as I enjoyed making it. Your satisfaction is my top priority, and I am committed to making your experience as smooth and enjoyable as possible.</p>
  <p>As a thank-you for your support, please enjoy <strong>{{discount_value}}% off your next order</strong> with your personal code below. It’s valid for {{discount_days}} days and can be used once at checkout with the same email address you used for this purchase.</p>
  {{discount_offer}}
  <p>If you have any questions, just reply to this email. You can also visit <a href="https://www.artbyme.studio/shop" style="color:#3A7D7B;">ArtByME.studio</a> to explore my latest artwork.</p>
  <p>Thank you for being part of my journey and for giving me the chance to serve you. Once your artwork arrives, I would love to hear what you think and would appreciate it if you would <a href="https://www.artbyme.studio/reviews#share" style="color:#3A7D7B;">leave a review on my website</a>.</p>
  <p>Warm regards,<br/>Margaret Edmondson<br/>Artist<br/><strong>Art By ME</strong></p>
</div>
$letter$
where automation_id = (select id from public.email_automations where slug = 'post-purchase')
  and step_order = 1;
