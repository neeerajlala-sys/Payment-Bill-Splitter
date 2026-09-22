// Cloudflare Worker backend for Razorpay Payment Links + KV status tracking.
// Set secrets with: wrangler secret put RAZORPAY_KEY_ID (and KEY_SECRET, WEBHOOK_SECRET)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {headers: cors()});
    try {
      if (url.pathname === '/create-payment-link' && request.method === 'POST') return createLink(request, env);
      if (url.pathname === '/webhook/razorpay' && request.method === 'POST') return webhook(request, env);
      if (url.pathname.startsWith('/status/') && request.method === 'GET') return status(url.pathname.split('/').pop(), env);
      return json({error:'Not found'},404);
    } catch (error) { return json({error:error.message || 'Server error'},500); }
  }
};
const cors=()=>({'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors(),'Content-Type':'application/json'}});
async function createLink(request,env){
  const body=await request.json(); const amount=Number(body.amount); const name=String(body.name||'Participant').slice(0,100);
  if(!Number.isFinite(amount)||amount<=0||amount>10000000) return json({error:'Invalid amount'},400);
  if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET) return json({error:'Razorpay server credentials are not configured'},500);
  const auth=btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const response=await fetch('https://api.razorpay.com/v1/payment_links',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({amount:Math.round(amount*100),currency:'INR',description:String(body.description||'Bill split payment').slice(0,255),customer:{name},notify:{sms:false,email:false},reminder_enable:false})});
  const data=await response.json(); if(!response.ok) return json({error:data.error?.description||'Razorpay rejected the request'},502);
  await env.PAYMENTS.put(data.id,JSON.stringify({status:'pending',amount,name,updatedAt:new Date().toISOString()}));
  return json({linkId:data.id,shortUrl:data.short_url});
}
async function webhook(request,env){
  const raw=await request.text(); const signature=request.headers.get('x-razorpay-signature')||'';
  if(!env.RAZORPAY_WEBHOOK_SECRET||!await verify(raw,signature,env.RAZORPAY_WEBHOOK_SECRET)) return json({error:'Invalid signature'},401);
  const event=JSON.parse(raw); if(event.event!=='payment.captured'&&event.event!=='payment_link.paid') return json({received:true});
  const linkId=event.payload?.payment_link?.entity?.id||event.payload?.payment?.entity?.payment_link_id||event.payload?.payment?.entity?.invoice_id;
  if(linkId){const old=await env.PAYMENTS.get(linkId,'json')||{};await env.PAYMENTS.put(linkId,JSON.stringify({...old,status:'paid',paidAt:new Date().toISOString()}));}
  return json({received:true});
}
async function verify(body,signature,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));const expected=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return signature.length===expected.length&&crypto.timingSafeEqual?crypto.timingSafeEqual(new TextEncoder().encode(signature),new TextEncoder().encode(expected)):signature===expected}
async function status(linkId,env){if(!/^[A-Za-z0-9_\-]+$/.test(linkId))return json({error:'Invalid link id'},400);const data=await env.PAYMENTS.get(linkId,'json');return data?json({linkId,status:data.status,amount:data.amount}):json({error:'Unknown payment link'},404)}
