// Authored by DotWin
// Shared shape for the "audience list -> campaign recipients" join.
//
// Both the admin send route and the cron send worker materialize a campaign's
// recipient queue from the same `contact_list_members -> crm_contacts` embed,
// and both talk to a Supabase client that carries no Database generic, so the
// row shape has to be declared rather than inferred.

/** The contact columns the recipient queue snapshots off the audience list. */
export interface AudienceContact {
  id: string
  email: string | null
  first_name: string | null
  status: string | null
}

/**
 * One row of the audience-list join.
 *
 * PostgREST returns an embedded to-one relation as an object, but hands back a
 * single-element array whenever it cannot prove the relation is to-one (an
 * ambiguous or newly added foreign key will do it). Both shapes are accepted so
 * a schema change can never silently empty a campaign's queue.
 */
export interface AudienceMemberRow {
  contact: AudienceContact | AudienceContact[] | null
}

/** A contact that is actually mailable: subscribed, with a deliverable address. */
export type SendableContact = AudienceContact & { email: string }

/**
 * Flatten an audience-list join into the contacts a campaign may be sent to.
 *
 * Unsubscribed, bounced and address-less contacts are dropped here; the send
 * worker re-checks status at delivery time, so this is a first pass and not the
 * suppression check.
 */
export function toSendableContacts(members: AudienceMemberRow[] | null): SendableContact[] {
  return (members ?? [])
    .map((row) => (Array.isArray(row.contact) ? row.contact[0] ?? null : row.contact))
    .filter(
      (contact): contact is SendableContact =>
        !!contact && contact.status === 'active' && !!contact.email
    )
}
