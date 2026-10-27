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
  if (event.status !== 'open') return 'closed';
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
