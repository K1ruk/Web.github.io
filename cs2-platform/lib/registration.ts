export type PlayerProfile = {
  nickname: string;
  primary_role: string | null;
  secondary_role: string | null;
  preferred_language: string;
} | null;

export type PublicTournament = {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  fee_cents: number;
  capacity: number;
  starts_at: string | null;
  registration_closes_at: string | null;
  confirmed: number;
  /** Design-only fixture: NEVER eligible for checkout or database registration. */
  demo?: boolean;
};

/**
 * A visual-only example shown when NEXUS has no published events.
 * No real tournament, teams, paid slots or schedule exist behind this card.
 */
export const BVG_FRIENDS_LEAGUE_DEMO: PublicTournament = {
  id: 'demo-bvg-friends-league',
  name: 'BVG - Friends League',
  slug: 'bvg-friends-league',
  status: 'demo',
  currency: 'sek',
  fee_cents: 0,
  capacity: 50, // 10 planned squads × 5 players each
  confirmed: 0,
  starts_at: null,
  registration_closes_at: null,
  demo: true,
};

export type PlayerRegistration = {
  tournament_id: string;
  status: string;
  hold_expires_at: string | null;
};

export function profileIsReady(profile: PlayerProfile): boolean {
  return !!(
    profile &&
    profile.nickname.trim().length >= 2 &&
    !/^Player-[a-f0-9]{8}$/i.test(profile.nickname) &&
    profile.primary_role &&
    profile.secondary_role &&
    profile.primary_role !== profile.secondary_role
  );
}

export type EntryAvailability = 'open' | 'full' | 'closed' | 'scheduled';

export function entryAvailability(event: PublicTournament, now: number): EntryAvailability {
  if (event.demo || event.status !== 'open') return 'closed';
  if (event.starts_at && Date.parse(event.starts_at) <= now) return 'closed';
  if (event.registration_closes_at && Date.parse(event.registration_closes_at) <= now) return 'closed';
  // Only confirmed entries are public. Open payment holds are still verified
  // atomically by the server at checkout, not guessed in the browser.
  if (event.confirmed >= event.capacity) return 'full';
  return 'open';
}

export function activePayment(reg: PlayerRegistration | undefined, now: number): boolean {
  return !!reg && reg.status === 'pending_payment'
    && !!reg.hold_expires_at && Date.parse(reg.hold_expires_at) > now;
}

export function confirmedEntry(reg: PlayerRegistration | undefined): boolean {
  return !!reg && reg.status === 'paid';
}

export function displayFee(cents: number, currency: string, locale: 'en' | 'mn' = 'en'): string {
  return new Intl.NumberFormat(locale === 'mn' ? 'mn-MN' : 'en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
