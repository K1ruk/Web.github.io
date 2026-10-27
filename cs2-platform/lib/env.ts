export function publicEnv() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key) throw new Error('Supabase public environment is missing');
 return {url,key};
}
export function siteUrl() { const raw=process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; const u=new URL(raw); if(process.env.NODE_ENV==='production'&&u.protocol!=='https:') throw new Error('HTTPS site URL required in production'); return u.origin; }
