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
 * The avatar can be fetched with STEAM_WEB_API_KEY when configured, otherwise
 * from Steam's public community XML profile. No Steam API key is sent client-side.
 */
export async function steamAvatarFromId(steamId: string | null): Promise<string | null> {
  if (!steamId || !/^\d{17}$/.test(steamId)) return null;

  const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
  if (apiKey) {
    try {
      const endpoint = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
      endpoint.searchParams.set('key', apiKey);
      endpoint.searchParams.set('steamids', steamId);
      const response = await fetch(endpoint, {
        next: { revalidate: 60 * 60 },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data: unknown = await response.json();
        const players = (data as { response?: { players?: Array<{ steamid?: string; avatarfull?: string; avatarmedium?: string }> } })?.response?.players;
        const player = players?.find(item => item.steamid === steamId);
        const avatar = trustedAvatar(player?.avatarfull || player?.avatarmedium, 'steam');
        if (avatar) return avatar;
      }
    } catch {
      // Steam API keys are optional in local development.
    }
  }

  try {
    // Public Steam Community XML is deprecated but remains a useful fallback
    // for development without a Steam Web API key.
    const response = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'text/xml, application/xml' },
    });
    if (!response.ok) return null;

    const xml = await response.text();
    if (xml.length > 250_000) return null;
    const raw = /<avatarFull>(?:<!\[CDATA\[)?([^<]*?)(?:\]\]>)?<\/avatarFull>/i.exec(xml)?.[1]?.trim()
      || /<avatarMedium>(?:<!\[CDATA\[)?([^<]*?)(?:\]\]>)?<\/avatarMedium>/i.exec(xml)?.[1]?.trim();
    return trustedAvatar(raw, 'steam');
  } catch {
    return null;
  }
}
