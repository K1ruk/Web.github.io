import 'server-only';
import { provisionalSkill } from '@/lib/skill';

type FaceitPlayer = {
  player_id: string;
  nickname: string;
  steam_id_64?: string;
  games?: Record<string, { faceit_elo?: number; skill_level?: number }>;
};

type FaceitHistory = {
  items?: Array<{ stats?: Record<string, string> }>;
};

export type FaceitFailureCode = 'not_configured' | 'invalid_key' | 'rate_limited' | 'unavailable' | 'timeout' | 'invalid_response';

export class FaceitRequestError extends Error {
  constructor(
    public readonly code: FaceitFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'FaceitRequestError';
  }
}

export function faceitConfigured() {
  const key = process.env.FACEIT_API_KEY?.trim();
  return !!key && !/^(YOUR_|your-|PLACEHOLDER)/i.test(key);
}

async function faceitGet<T>(path: string): Promise<T | null> {
  const key = process.env.FACEIT_API_KEY?.trim();
  if (!faceitConfigured() || !key) {
    throw new FaceitRequestError('not_configured', 'FACEIT_API_KEY is missing. Add a server-side FACEIT Data API key to .env.local and restart the server.');
  }
  let response: Response;
  try {
    response = await fetch('https://open.faceit.com/data/v4' + path, {
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    throw new FaceitRequestError('timeout', 'FACEIT could not be reached. Please try again.');
  }
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new FaceitRequestError('invalid_key', 'FACEIT rejected the API key. Check the server-side key in your environment settings.');
  }
  if (response.status === 429) {
    throw new FaceitRequestError('rate_limited', 'FACEIT is rate-limiting requests. Try again after the limit resets.');
  }
  if (!response.ok) {
    throw new FaceitRequestError('unavailable', 'FACEIT temporarily returned an error. Try again later.');
  }
  try {
    return await response.json() as T;
  } catch {
    throw new FaceitRequestError('invalid_response', 'FACEIT returned unreadable player data.');
  }
}

export async function analyzeSteam(steamId: string) {
  if (!/^[0-9]{17}$/.test(steamId)) {
    throw new Error('Invalid verified Steam ID64');
  }

  const player = await faceitGet<FaceitPlayer>(
    '/players?game=cs2&game_player_id=' + encodeURIComponent(steamId),
  );

  if (!player) {
    return {
      found: false as const,
      reason: 'No FACEIT CS2 account was found for this SteamID64. This player needs manual review.',
    };
  }
  if (player.steam_id_64 && player.steam_id_64 !== steamId) {
    throw new FaceitRequestError('invalid_response', 'FACEIT returned an account that does not match the verified Steam ID.');
  }
  if (!player.player_id || typeof player.player_id !== 'string') {
    throw new FaceitRequestError('invalid_response', 'FACEIT returned incomplete account data.');
  }

  const elo = player.games?.cs2?.faceit_elo;
  if (typeof elo !== 'number' || !Number.isFinite(elo)) {
    return {
      found: false as const,
      nickname: player.nickname,
      reason: 'FACEIT account found, but no CS2 Elo is available. Manual tier review is required.',
    };
  }

  let kdValues: number[] = [];
  let statsAvailable = true;
  try {
    const history = await faceitGet<FaceitHistory>(
      '/players/' + encodeURIComponent(player.player_id) + '/games/cs2/stats?offset=0&limit=30',
    );
    if (!history || !Array.isArray(history.items)) {
      statsAvailable = false;
    } else {
      kdValues = history.items
        .map(item => Number(item.stats?.['K/D Ratio']))
        .filter(value => Number.isFinite(value) && value > 0 && value < 15);
    }
  } catch (error) {
    // Elo remains valid even if the match-statistics endpoint fails.
    // No performance bonus is applied without a reliable sample.
    if (error instanceof FaceitRequestError && error.code === 'invalid_key') throw error;
    statsAvailable = false;
  }
  const kd = kdValues.length
    ? kdValues.reduce((total, value) => total + value, 0) / kdValues.length
    : null;
  const suggested = provisionalSkill(elo, kd, kdValues.length);
  return {
    found: true as const,
    playerId: player.player_id,
    nickname: player.nickname,
    faceitLevel: player.games?.cs2?.skill_level ?? null,
    statsAvailable,
    ...suggested,
  };
}
