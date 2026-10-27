import 'server-only';
export async function resolveSteamUrl(raw:string):Promise<string>{
 let url:URL;try{url=new URL(raw);}catch{throw new Error('Invalid Steam URL');}
 if(url.protocol!=='https:'||url.hostname!=='steamcommunity.com'||url.username||url.password||url.port)throw new Error('Only HTTPS Steam Community profile links are accepted');
 const direct=/^\/profiles\/([0-9]{17})\/?$/.exec(url.pathname);if(direct)return direct[1];
 const vanity=/^\/id\/([a-zA-Z0-9_-]{2,64})\/?$/.exec(url.pathname);
 if(!vanity)throw new Error('Expected steamcommunity.com/profiles/ID or /id/name');
 const key=process.env.STEAM_WEB_API_KEY;
 if(!key)throw new Error('Set STEAM_WEB_API_KEY to resolve custom profile URLs');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const api=new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
  api.searchParams.set('key',key);api.searchParams.set('vanityurl',vanity[1]);
  const res=await fetch(api,{cache:'no-store',signal:controller.signal});
  if(!res.ok)throw new Error('Steam profile lookup unavailable');
  const body=await res.json() as {response?:{success?:number;steamid?:string}};
  if(body.response?.success!==1||!body.response.steamid||!/^[0-9]{17}$/.test(body.response.steamid))throw new Error('Steam profile not found');
  return body.response.steamid;
 }finally{clearTimeout(timeout);}
}
