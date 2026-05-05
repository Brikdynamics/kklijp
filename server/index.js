import http from 'http';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const dbPath = path.join(__dirname, 'data', 'db.json');
const PORT = process.env.PORT || 8787;
const ADMIN_PASSWORD = process.env.KKLIJP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'ADMIN2026';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

const categories = [
  { id:'all', label:'Alles' },
  { id:'painful', label:'Pijnlijk' },
  { id:'risky', label:'Riskant' },
  { id:'inventive', label:'Uitvindingen' },
  { id:'games', label:'Games' },
  { id:'lifehacks', label:'Lifehacks' },
  { id:'skills', label:'Vaardigheden' },
  { id:'hotties', label:'Hotties' },
  { id:'wtf', label:'WTF' },
  { id:'fails', label:'Fails' },
  { id:'random', label:'Willekeurig' }
];
const categoryIds = categories.filter(c=>c.id!=='all').map(c=>c.id);
const categoryKeywords = {
  painful: ['pain','painful','ouch','hurt','hurts','injury','injured','crash','slam','hit','smack','fall','falls','wipeout','accident','broken','faceplant','skateboard','bmx','bikecrash','scootercrash','pijn','pijnlijk','auw','au','val','vallen','ongeluk','klap','botsing','gebroken'],
  risky: ['risk','risky','danger','dangerous','extreme','jump','rooftop','roof','closecall','close-call','stunt','cliff','parkour','backflip','frontflip','drift','speed','almost','insanejump','risico','riskant','gevaar','gevaarlijk','dak','sprong','bijna','stunt'],
  inventive: ['invent','invention','inventive','build','builder','machine','maker','creative','homemade','engineering','robot','tool','workshop','gadget','contraption','device','experiment','uitvinding','uitvinden','bouwen','zelfgemaakt','slim','creatief','apparaat','machine','knutsel','werkplaats'],
  games: ['game','games','gaming','gamer','clutch','fps','minecraft','fortnite','cod','callofduty','gta','roundwin','speedrun','streamer','console','xbox','playstation','nintendo','valorant','csgo','counterstrike'],
  lifehacks: ['lifehack','lifehacks','hack','trick','tip','easy','smart','solution','kitchen','repair','cleaning','shortcut','howto','tutorial','diy','waterpump','pump','fix','toolhack','truc','handig','oplossing','keuken','reparatie','schoonmaken','makkelijk','waterpomp','pomp','repareren'],
  skills: ['skill','skills','talent','perfect','respect','freestyle','trickshot','football','soccer','basketball','dance','artist','drawing','magic','juggle','juggling','control','precision','acrobat','vaardigheid','talent','voetbal','basketbal','dans','tekenen','magie','jongleren','controle','precisie','acrobaat'],
  hotties: ['hot','hottie','hotties','babe','babes','girl','girls','model','pool','beach','summer','fit','fitness','beauty','cute','bikini','fashion','swimwear','glamour'],
  wtf: ['wtf','weird','crazy','unexpected','strange','bizarre','noway','no-way','wild','unreal','random','confusing','odd','madness'],
  fails: ['fail','fails','failed','oops','epicfail','wrong','karma','mistake','blooper','disaster','idiot','stupid','instantkarma','compilation'],
  random: ['meme','funny','lol','reaction','animal','animals','dog','cat','street','school','party','news','moment','grappig','reactie','dier','dieren','hond','kat','straat','school','feest','nieuws']
};
const synonyms = {
  fail:['fails','epicfail','oops','karma','blooper'], crash:['wipeout','slam','accident'], skateboard:['skate','skater'], risky:['danger','extreme','stunt'],
  hot:['hottie','hotties','babe','summer'], girl:['girls','babe'], game:['gaming','gamer','clutch'], skill:['skills','talent','respect'],
  lifehack:['hack','tip','smart','diy'], diy:['build','maker'], football:['soccer','skills'], waterpump:['pump','lifehack','diy']
};
const ytCategoryMap = { '20':'games', '17':'skills', '26':'lifehacks', '28':'inventive', '24':'random', '22':'random', '23':'random' };
const stopWords = new Set('de het een en of op met van voor naar in is zijn was ben door over deze dit dat maar als kan kun geen wel je jij jouw jullie onze mijn wij hij zij the and or with from this that will would should can could just about into out you your yours their they them reel reels shorts youtube facebook watch official clip clips full new old best top very echt gewoon heel daar waar wanneer hoe waarom niet wel bij uit zonder upload kijk deel kklijp video viral fyp'.split(' '));
const flood = new Map();

function send(res, status, data, type='application/json') {
  const body = type === 'application/json' ? JSON.stringify(data) : data;
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'Content-Type,X-Admin-Password' });
  res.end(body);
}
function sendError(res, status, message) { send(res, status, { error: message }); }
async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 5_000_000) { req.destroy(); reject(new Error('Body te groot.')); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}
function clientIp(req) { return String(req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || 'unknown'; }
function floodCheck(req, action, limit, windowMs) { const ip=clientIp(req); const key=`${action}:${ip}`; const now=Date.now(); const hits=(flood.get(key)||[]).filter(t=>now-t<windowMs); if(hits.length>=limit) return false; hits.push(now); flood.set(key,hits); return true; }
async function ensureDb() { await fs.mkdir(path.dirname(dbPath), {recursive:true}); try { await fs.access(dbPath); } catch { await fs.writeFile(dbPath, JSON.stringify({ videos:[], users:{}, likes:{} }, null, 2)); } }
async function readDb() { await ensureDb(); const db=JSON.parse(await fs.readFile(dbPath,'utf-8')); db.videos ||= []; db.users ||= {}; db.likes ||= {}; return db; }
async function writeDb(db) { await fs.writeFile(dbPath, JSON.stringify(db, null, 2)); }
function normalizeName(name) { return String(name||'').trim().replace(/\s+/g,' ').slice(0,32); }
function nameKey(name) { return normalizeName(name).toLowerCase(); }
async function claimOrCheckUser(db, req, name) { const username=normalizeName(name); if(!username) throw new Error('Vul een naam in.'); const key=nameKey(username); const ip=clientIp(req); const existing=db.users[key]; if(existing && existing.ip!==ip) throw new Error(`Naam "${username}" is al in gebruik. Kies een andere naam.`); if(!existing) db.users[key]={username,ip,createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString()}; else db.users[key].lastSeenAt=new Date().toISOString(); return db.users[key].username; }
function requireAdmin(req, body, parsed) { const pass = req.headers['x-admin-password'] || body?.adminPassword || parsed.searchParams.get('adminPassword'); return pass === ADMIN_PASSWORD; }
function cleanTag(s) { return String(s||'').toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9à-ÿ]+/gi,'').trim(); }
function detectPlatform(url) { try { const h=new URL(url).hostname.replace('www.','').toLowerCase(); if(h.includes('youtube.com')||h.includes('youtu.be')) return 'youtube'; if(h.includes('facebook.com')||h.includes('fb.watch')) return 'facebook'; return 'link'; } catch { return 'link'; } }
function getYouTubeId(url) { try { const u=new URL(url); if(u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0]; if(u.searchParams.get('v')) return u.searchParams.get('v'); const parts=u.pathname.split('/').filter(Boolean); for(const marker of ['shorts','embed','live']) { const i=parts.indexOf(marker); if(i>=0&&parts[i+1]) return parts[i+1]; } } catch {} return null; }
function pickMeta(html, prop) { const res=[new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,'i'),new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`,'i')]; for(const re of res){ const m=html.match(re); if(m?.[1]) return m[1].replace(/&amp;/g,'&'); } return ''; }
async function fetchOpenGraph(link) { try { const r=await fetch(link,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 KKLIJP preview'}}); const html=await r.text(); return { finalUrl:r.url||link, title:pickMeta(html,'og:title'), description:pickMeta(html,'og:description'), image:pickMeta(html,'og:image')||pickMeta(html,'twitter:image') }; } catch { return { finalUrl:link, title:'', description:'', image:'' }; } }
async function fetchYouTubeMeta(videoId) { if(!YOUTUBE_API_KEY||!videoId) return null; try { const apiUrl=`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`; const r=await fetch(apiUrl); if(!r.ok) return null; const data=await r.json(); const s=data.items?.[0]?.snippet; if(!s) return null; return { title:s.title||'', description:s.description||'', tags:Array.isArray(s.tags)?s.tags:[], categoryId:s.categoryId||'', thumbnailUrl:s.thumbnails?.maxres?.url||s.thumbnails?.standard?.url||s.thumbnails?.high?.url||s.thumbnails?.medium?.url||'' }; } catch { return null; } }
function facebookEmbedUrl(link) { return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(link)}&show_text=false&width=1280`; }
function scoreCategory(inputs, ytCat) { const text=inputs.join(' ').toLowerCase().replace(/[#_]+/g,' '); const score=Object.fromEntries(categoryIds.map(c=>[c,0])); if(ytCat&&ytCategoryMap[ytCat]) score[ytCategoryMap[ytCat]]+=6; for(const [cat,words] of Object.entries(categoryKeywords)) for(const raw of words){ const w=raw.toLowerCase(); if(text.includes(w.replace(/-/g,' '))||text.includes(w)) score[cat]+=w.length>6?3:2; } for(const token of inputs.flatMap(x=>String(x).split(/[\s,#/|;:]+/))){ const clean=cleanTag(token); for(const [cat,words] of Object.entries(categoryKeywords)) if(words.includes(clean)) score[cat]+=4; } const best=Object.entries(score).sort((a,b)=>b[1]-a[1])[0]; return best && best[1]>0 ? best[0] : 'random'; }
function generateHashtags({customTitle, platformTitle, description, category, apiTags=[]}) { const tags=new Set(); (categoryKeywords[category]||[]).slice(0,8).forEach(t=>tags.add(cleanTag(t))); apiTags.forEach(tag=>{ const whole=cleanTag(tag); if(whole.length>=3&&whole.length<=28&&!stopWords.has(whole)) tags.add(whole); String(tag).split(/[\s,;|/#]+/).forEach(p=>{ const t=cleanTag(p); if(t.length>=3&&t.length<=28&&!stopWords.has(t)) tags.add(t); }); }); String([customTitle,platformTitle,description].join(' ')).split(/[\s,.;:!?()[\]{}<>"'`~|/#]+/).forEach(w=>{ const t=cleanTag(w); if(t.length>=3&&t.length<=28&&!stopWords.has(t)){ tags.add(t); (synonyms[t]||[]).forEach(s=>{ const x=cleanTag(s); if(x&&!stopWords.has(x)) tags.add(x); }); } }); return Array.from(tags).filter(Boolean).slice(0,50); }
async function buildVideoData(link, customTitle, postedBy) { let platform=detectPlatform(link); let finalUrl=link; let og={title:'',description:'',image:''}; if(platform==='facebook'||platform==='link'){ og=await fetchOpenGraph(link); finalUrl=og.finalUrl||link; platform=detectPlatform(finalUrl); } const ytId=platform==='youtube'?getYouTubeId(finalUrl):null; const yt=ytId?await fetchYouTubeMeta(ytId):null; const platformTitle=yt?.title||og.title||''; const description=yt?.description||og.description||''; const category=scoreCategory([customTitle,platformTitle,description,...(yt?.tags||[])],yt?.categoryId); const hashtags=generateHashtags({customTitle,platformTitle,description,category,apiTags:yt?.tags||[]}); const thumbnailUrl=platform==='youtube'&&ytId?(yt?.thumbnailUrl||`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`):(og.image||''); const embedUrl=platform==='youtube'&&ytId?`https://www.youtube.com/embed/${ytId}`:platform==='facebook'?facebookEmbedUrl(finalUrl):finalUrl; return { id:`v-${Date.now()}-${Math.random().toString(16).slice(2)}`, url:finalUrl, platform, platformId:ytId||'', title:customTitle||platformTitle||'Zonder titel', platformTitle, description, thumbnailUrl, embedUrl, category, hashtags, postedBy, likes:0, views:0, comments:[], status:'pending', createdAt:new Date().toISOString() }; }

async function api(req, res, parsed) {
  const method = req.method;
  const p = parsed.pathname;
  const body = ['POST','PATCH','DELETE'].includes(method) ? await readBody(req) : {};

  if(method==='GET' && p==='/api/categories') { const db=await readDb(); const approved=db.videos.filter(v=>(v.status||'approved')==='approved'); return send(res,200,categories.map(c=>({...c,count:c.id==='all'?approved.length:approved.filter(v=>v.category===c.id).length}))); }
  if(method==='POST' && p==='/api/session') { const db=await readDb(); try { const username=await claimOrCheckUser(db,req,body?.name); await writeDb(db); return send(res,200,{username}); } catch(e){ return sendError(res,409,e.message); } }
  if(method==='GET' && p==='/api/videos') { const db=await readDb(); let rows=db.videos.filter(v=>(v.status||'approved')==='approved'); const q=parsed.searchParams.get('q')||''; const category=parsed.searchParams.get('category')||'all'; const sort=parsed.searchParams.get('sort')||'date'; const order=parsed.searchParams.get('order')||'desc'; if(category&&category!=='all') rows=rows.filter(v=>v.category===category); if(q){ const needle=String(q).toLowerCase().replace(/^#/,''); rows=rows.filter(v=>[v.title,v.postedBy,v.platform,v.category,...(v.hashtags||[])].join(' ').toLowerCase().includes(needle)); } const dir=order==='asc'?1:-1; rows.sort((a,b)=>{ if(sort==='likes') return dir*((a.likes||0)-(b.likes||0)); if(sort==='views') return dir*((a.views||0)-(b.views||0)); if(sort==='name') return dir*String(a.title).localeCompare(String(b.title)); return dir*(new Date(a.createdAt)-new Date(b.createdAt)); }); return send(res,200,rows); }
  const videoIdMatch = p.match(/^\/api\/videos\/([^/]+)$/);
  if(method==='GET' && videoIdMatch){ const db=await readDb(); const v=db.videos.find(x=>x.id===videoIdMatch[1]&&(x.status||'approved')==='approved'); return v?send(res,200,v):sendError(res,404,'Niet gevonden.'); }
  if(method==='POST' && p==='/api/videos') { if(!floodCheck(req,'upload',3,10*60*1000)) return sendError(res,429,'Te veel uploads. Wacht even en probeer opnieuw.'); if(!body?.url) return sendError(res,400,'Plak een videolink.'); const db=await readDb(); try { const username=await claimOrCheckUser(db,req,body?.name); const video=await buildVideoData(body.url,String(body.title||'').trim().slice(0,120),username); db.videos.push(video); await writeDb(db); return send(res,201,video); } catch(e){ return sendError(res,409,e.message); } }
  const viewMatch=p.match(/^\/api\/videos\/([^/]+)\/view$/);
  if(method==='POST' && viewMatch){ const db=await readDb(); const v=db.videos.find(x=>x.id===viewMatch[1]&&(x.status||'approved')==='approved'); if(!v) return sendError(res,404,'Niet gevonden.'); v.views=(v.views||0)+1; await writeDb(db); return send(res,200,v); }
  const likeMatch=p.match(/^\/api\/videos\/([^/]+)\/like$/);
  if(method==='POST' && likeMatch){ const db=await readDb(); try { const username=await claimOrCheckUser(db,req,body?.name); const v=db.videos.find(x=>x.id===likeMatch[1]&&(x.status||'approved')==='approved'); if(!v) return sendError(res,404,'Niet gevonden.'); db.likes[v.id] ||= []; if(!db.likes[v.id].includes(username)){ db.likes[v.id].push(username); v.likes=(v.likes||0)+1; } await writeDb(db); return send(res,200,v); } catch(e){ return sendError(res,409,e.message); } }
  const commentMatch=p.match(/^\/api\/videos\/([^/]+)\/comments$/);
  if(method==='POST' && commentMatch){ if(!floodCheck(req,'comment',5,2*60*1000)) return sendError(res,429,'Te veel reacties. Wacht even en probeer opnieuw.'); const text=String(body?.text||'').trim().slice(0,500); if(!text) return sendError(res,400,'Typ een reactie.'); const db=await readDb(); try { const username=await claimOrCheckUser(db,req,body?.name); const v=db.videos.find(x=>x.id===commentMatch[1]&&(x.status||'approved')==='approved'); if(!v) return sendError(res,404,'Niet gevonden.'); v.comments ||= []; v.comments.push({id:`c-${Date.now()}-${Math.random().toString(16).slice(2)}`,name:username,text,createdAt:new Date().toISOString()}); await writeDb(db); return send(res,201,v); } catch(e){ return sendError(res,409,e.message); } }
  if(method==='GET' && p==='/api/trending'){ const db=await readDb(); const tags={}; db.videos.filter(v=>(v.status||'approved')==='approved').forEach(v=>(v.hashtags||[]).forEach(t=>{ if(!stopWords.has(t)) tags[t]=(tags[t]||0)+Math.max(1,v.views||0)+(v.likes||0)*4; })); return send(res,200,Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,16).map(([tag,score])=>({tag,score}))); }
  if(method==='GET' && p==='/api/top'){ const db=await readDb(); return send(res,200,db.videos.filter(v=>(v.status||'approved')==='approved').sort((a,b)=>((b.views||0)+(b.likes||0)*12+(b.comments?.length||0)*8)-((a.views||0)+(a.likes||0)*12+(a.comments?.length||0)*8)).slice(0,6)); }
  if(method==='GET' && p==='/api/admin/videos'){ if(!requireAdmin(req,body,parsed)) return sendError(res,401,'Admin wachtwoord klopt niet.'); const db=await readDb(); const status=parsed.searchParams.get('status')||'all'; const rows=status==='all'?db.videos:db.videos.filter(v=>(v.status||'approved')===status); return send(res,200,rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))); }
  const adminVideoMatch=p.match(/^\/api\/admin\/videos\/([^/]+)$/);
  if(method==='PATCH' && adminVideoMatch){ if(!requireAdmin(req,body,parsed)) return sendError(res,401,'Admin wachtwoord klopt niet.'); const db=await readDb(); const v=db.videos.find(x=>x.id===adminVideoMatch[1]); if(!v) return sendError(res,404,'Niet gevonden.'); for(const k of ['title','category','hashtags','status','thumbnailUrl','embedUrl','url','postedBy','description']) if(k in body) v[k]=k==='hashtags'?String(body[k]).split(/[\s,#]+/).map(cleanTag).filter(Boolean).slice(0,80):(k==='postedBy'?normalizeName(body[k]):body[k]); if(body.status==='approved'&&!v.approvedAt) v.approvedAt=new Date().toISOString(); await writeDb(db); return send(res,200,v); }
  if(method==='DELETE' && adminVideoMatch){ if(!requireAdmin(req,body,parsed)) return sendError(res,401,'Admin wachtwoord klopt niet.'); const db=await readDb(); db.videos=db.videos.filter(x=>x.id!==adminVideoMatch[1]); delete db.likes[adminVideoMatch[1]]; await writeDb(db); return send(res,200,{ok:true}); }
  const approveMatch=p.match(/^\/api\/admin\/videos\/([^/]+)\/approve$/);
  if(method==='POST' && approveMatch){ if(!requireAdmin(req,body,parsed)) return sendError(res,401,'Admin wachtwoord klopt niet.'); const db=await readDb(); const v=db.videos.find(x=>x.id===approveMatch[1]); if(!v) return sendError(res,404,'Niet gevonden.'); v.status='approved'; v.approvedAt=new Date().toISOString(); await writeDb(db); return send(res,200,v); }
  if(method==='POST' && p==='/api/admin/videos/batch'){ if(!requireAdmin(req,body,parsed)) return sendError(res,401,'Admin wachtwoord klopt niet.'); const text=String(body?.text||''); const fallbackName=normalizeName(body?.postedBy||'Admin')||'Admin'; const requestedStatus=body?.status==='pending'?'pending':'approved'; const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,200); if(!lines.length) return sendError(res,400,'Plak minimaal één videolink.'); const db=await readDb(); const errors=[]; const created=[]; for(let i=0;i<lines.length;i++){ const line=lines[i]; try{ const parts=line.split('|').map(x=>x.trim()); const link=parts[0]; const title=parts[1]||''; const postedBy=normalizeName(parts[2]||fallbackName)||fallbackName; if(!/^https?:\/\//i.test(link)) throw new Error('Geen geldige link.'); const video=await buildVideoData(link,title.slice(0,120),postedBy); video.status=requestedStatus; if(requestedStatus==='approved') video.approvedAt=new Date().toISOString(); db.videos.push(video); created.push(video); } catch(e){ errors.push({line:i+1,input:line.slice(0,180),error:e.message||'Onbekende fout'}); } } await writeDb(db); return send(res,201,{added:created.length,failed:errors.length,errors,videos:created}); }
  return sendError(res,404,'API niet gevonden.');
}

const mimeTypes = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp' };
async function serveStatic(req, res, parsed) {
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';
  let filePath = path.normalize(path.join(distDir, pathname));
  if (!filePath.startsWith(distDir)) return sendError(res,403,'Verboden.');
  try { const stat=await fs.stat(filePath); if(stat.isDirectory()) filePath=path.join(filePath,'index.html'); const content=await fs.readFile(filePath); const ext=path.extname(filePath); res.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' }); res.end(content); }
  catch { try { const content=await fs.readFile(path.join(distDir,'index.html')); res.writeHead(200, { 'content-type':'text/html; charset=utf-8' }); res.end(content); } catch { res.writeHead(500); res.end('Frontend dist/index.html ontbreekt.'); } }
}

const server = http.createServer(async (req,res)=>{
  try {
    res.setHeader('access-control-allow-origin','*');
    res.setHeader('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers','Content-Type,X-Admin-Password');
    if(req.method==='OPTIONS') { res.writeHead(204); return res.end(); }
    const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if(parsed.pathname.startsWith('/api/')) return await api(req,res,parsed);
    return await serveStatic(req,res,parsed);
  } catch(e) {
    console.error(e);
    return sendError(res,500,e.message || 'Serverfout.');
  }
});

server.listen(PORT, ()=>console.log(`KKLIJP v1.5.4 draait op poort ${PORT}`));
