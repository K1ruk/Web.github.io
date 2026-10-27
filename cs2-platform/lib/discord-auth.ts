/**
 * Discord is optional for general NEXUS login, but a verified Supabase OAuth
 * identity is required for competition entry. Never trust client-controlled
 * user_metadata to establish identity provider status.
 */
export function hasVerifiedDiscordProvider(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== 'object' || Array.isArray(appMetadata))
    return false;
  const data = appMetadata as Record<string, unknown>;
  return data.provider === 'discord'
    || (Array.isArray(data.providers) && data.providers.includes('discord'));
}
