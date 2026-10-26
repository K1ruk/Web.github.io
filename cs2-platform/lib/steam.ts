import 'server-only';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { siteUrl } from '@/lib/env';
export function nonce(){return randomBytes(32).toString('hex');}
export function equalNonce(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function openIdRedirect(state:string){
 const ret=siteUrl()+'/api/steam/callback?state='+encodeURIComponent(state);
 const p=new URLSearchParams({'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'checkid_setup','openid.return_to':ret,'openid.realm':siteUrl()+'/','openid.identity':'http://specs.openid.net/auth/2.0/identifier_select','openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'});
 return 'https://steamcommunity.com/openid/login?'+p.toString();
}
export async function verifyOpenId(callback:URL){
 const p=callback.searchParams;
 if(p.get('openid.mode')!=='id_res')throw new Error('Steam verification cancelled');
 if(p.get('openid.ns')!=='http://specs.openid.net/auth/2.0')throw new Error('Invalid OpenID namespace');
 if(p.get('openid.op_endpoint')!=='https://steamcommunity.com/openid/login')throw new Error('Untrusted OpenID provider');
 const ret=p.get('openid.return_to');if(!ret||!ret.startsWith(siteUrl()+'/api/steam/callback?'))throw new Error('Return URL mismatch');
 const requested=new URL(ret);
 if(requested.searchParams.get('state')!==p.get('state'))throw new Error('State mismatch');
 const claimed=p.get('openid.claimed_id')||'';
 const identity=p.get('openid.identity')||'';
 const match=/^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/.exec(claimed);
 if(!match||identity!==claimed)throw new Error('Invalid Steam identity');
 const data=new URLSearchParams();
 for(const [key,val] of p){if(key.startsWith('openid.'))data.set(key,val);}
 data.set('openid.mode','check_authentication');
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetch('https://steamcommunity.com/openid/login',{method:'POST',body:data,headers:{'Content-Type':'application/x-www-form-urlencoded'},cache:'no-store',signal:controller.signal});
 if(!response.ok)throw new Error('Steam identity verification failed');
 const body=await response.text();if(!/(^|\n)is_valid:true(\n|$)/.test(body))throw new Error('Steam signature rejected');
 return match[1];
 }finally{clearTimeout(timeout);}
}
