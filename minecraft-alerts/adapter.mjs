// GREÑA Minecraft alerts — adaptador universal de eventos.
// Módulo aislado: no altera las alertas existentes ni conecta a plataformas por su cuenta.
const PLATFORMS = new Set(['tiktok', 'twitch', 'kick', 'starvios']);
const TYPES = new Set(['follow', 'subscribe', 'gift', 'like', 'share', 'raid', 'donation', 'cheer']);
const clean = (v, max=100) => String(v ?? '').trim().slice(0,max);
const number = (v, fallback=0) => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : fallback;
const allowedImage = (url) => { try { const u = new URL(url); return ['https:','http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
export function normalizeMinecraftAlert(raw={}) {
  const platform = clean(raw.platform,24).toLowerCase();
  const type = clean(raw.type,24).toLowerCase();
  if (!PLATFORMS.has(platform) || !TYPES.has(type)) return null;
  const gift = raw.gift && typeof raw.gift === 'object' ? raw.gift : {};
  const username = clean(raw.username ?? raw.user?.name ?? raw.nickname ?? 'Usuario',64);
  const quantity = Math.min(100000, Math.max(1,Math.floor(number(gift.quantity ?? raw.quantity,1))));
  const giftId = clean(gift.id ?? raw.giftId ?? '',100);
  const giftName = clean(gift.name ?? raw.giftName ?? 'Regalo',100);
  return {
    id: clean(raw.id ?? [platform,type,username,giftId,raw.timestamp ?? Date.now()].join(':'),200),
    platform,type,username,
    gift: type === 'gift' ? {id:giftId,name:giftName,quantity,value:number(gift.value ?? raw.value),imageUrl:allowedImage(gift.imageUrl ?? raw.imageUrl),animationUrl:allowedImage(gift.animationUrl ?? raw.animationUrl)} : null,
    count:number(raw.count ?? raw.likes ?? raw.amount,0),
    timestamp:number(raw.timestamp,Date.now())
  };
}
export function chooseMinecraftGiftVisual(event) {
  const g=event?.gift ?? {};
  const name=String(g.name ?? '').toLowerCase();
  const rules=[
    [/rosa|rose|flor|flower/, 'flower'],
    [/coraz[oó]n|heart|love/, 'heart'],
    [/diamante|diamond/, 'diamond'],
    [/cofre|chest|treasure|tesoro/, 'chest'],
    [/corona|crown|king|queen/, 'crown'],
    [/tnt|explosi[oó]n|bomb/, 'tnt']
  ];
  const kind=rules.find(([re])=>re.test(name))?.[1] ?? 'custom';
  return {kind,sourceImage:g.imageUrl ?? null,sourceAnimation:g.animationUrl ?? null,label:g.name ?? 'Regalo',quantity:g.quantity ?? 1};
}
// Dedupe de eventos repetidos: mantener instancias por usuario/sesión.
export function createMinecraftAlertDeduper({ttlMs=120000,maxEntries=2000}={}) {
  const seen=new Map();
  return (event,now=Date.now()) => {
    if (!event?.id) return false;
    for(const [id,until] of seen) if(until<=now) seen.delete(id);
    if(seen.has(event.id)) return false;
    seen.set(event.id,now+ttlMs);
    if(seen.size>maxEntries) seen.delete(seen.keys().next().value);
    return true;
  };
}
