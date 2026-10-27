import 'server-only';

/**
 * Profile pictures are decoration, not authentication or authorization data.
 * Only serve HTTPS image URLs on expected Discord and Steam CDN hosts.
 */
function trustedAvatar(raw: unknown, provider: 'discord' | 'steam'): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (provider === 'discord') {
      if (!['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return null;
      if (!url.pathname.startsWith('/avatars/') && !url.pathname.startsWith('/embed/avatars/')) return null;
    } else {
      if (![
        'avatars.steamstatic.com',
        'avatars.akamai.steamstatic.com',
        'steamcdn-a.akamaihd.net',
        'steamcommunity-a.akamaihd.net',
      ].includes(url.hostname)) return null;
      if (url.hostname === 'steamcdn-a.akamaihd.net' &&
          !url.pathname.startsWith('/steamcommunity/public/images/avatars/')) return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Supabase already receives avatar_url/picture from Discord OAuth. */
export function discordAvatarFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  return trustedAvatar(metadata?.avatar_url, 'discord') ||
    trustedAvatar(metadata?.picture, 'discord');
}

/**
 * SteamID64 identifies the player, but the avatar CDN filename is a separate
 * hash. Prefer Valve's official GetPlayerSummaries API when a server-side key
 * is available. Otherwise resolve the public profile avatar by SteamID64
 * through Unavatar (never an arbitrary user-provided URL).
 *
 * The third-party fallback receives a public SteamID64 and is used only for
 * presentation. Never use avatars to establish account ownership.
 */
export async function steamAvatarFromId(steamId: string | null): Promise<string | null> {
  if (!steamId || !/^\\d{17}$/.test(steamId)) return null;

  const fallbackUrl = `https://unavatar.io/steam/profile:${steamId}`;
  const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
  if (!apiKey) return fallbackUrl;

  try {
    const endpoint = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
    endpoint.searchParams.set('key', apiKey);
    endpoint.searchParams.set('steamids', steamId);

    const response = await fetch(endpoint, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(3500),
    });
    if (response.ok) {
      const data: unknown = await response.json();
      const players = (data as {
        response?: { players?: Array<{
          steamid?: string;
          avatarfull?: string;
          avatarmedium?: string;
        }> }
      })?.response?.players;
      const player = players?.find(item => item.steamid === steamId);
      const avatar = trustedAvatar(player?.avatarfull || player?.avatarmedium, 'steam');
      if (avatar) return avatar;
    }
  } catch {
    // Fallback to the public SteamID-based avatar resolver if Valve is offline.
  }

  return fallbackUrl;
}
