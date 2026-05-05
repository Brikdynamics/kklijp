import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'data', 'db.json');
const app = express();
const PORT = process.env.PORT || 8787;
const ADMIN_PASSWORD = process.env.KKLIJP_ADMIN_PASSWORD || 'ADMIN2026';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

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
function floodCheck(req, action, limit, windowMs) {
  const ip = clientIp(req);
  const key = `${action}:${ip}`;
  const now = Date.now();
  const hits = (flood.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now); flood.set(key, hits); return true;
}
async function ensureDb() {
  await fs.mkdir(path.dirname(dbPath), { recursive:true });
  try { await fs.access(dbPath); } catch { await fs.writeFile(dbPath, JSON.stringify({ videos:[], users:{}, likes:{} }, null, 2)); }
}
async function readDb() { await ensureDb(); const db = JSON.parse(await fs.readFile(dbPath, 'utf-8')); db.videos ||= []; db.users ||= {}; db.likes ||= {}; return db; }
async function writeDb(db) { await fs.writeFile(dbPath, JSON.stringify(db, null, 2)); }
function clientIp(req) { return String(req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || req.ip || 'unknown'; }
function normalizeName(name) { return String(name||'').trim().replace(/\s+/g,' ').slice(0,32); }
function nameKey(name) { return normalizeName(name).toLowerCase(); }
async function claimOrCheckUser(db, req, name) {
  const username = normalizeName(name); if (!username) throw new Error('Vul een naam in.');
  const key = nameKey(username); const ip = clientIp(req); const existing = db.users[key];
  if (existing && existing.ip !== ip) throw new Error(`Naam "${username}" is al in gebruik. Kies een andere naam.`);
  if (!existing) db.users[key] = { username, ip, createdAt:new Date().toISOString(), lastSeenAt:new Date().toISOString() };
  else db.users[key].lastSeenAt = new Date().toISOString();
  return db.users[key].username;
}
function requireAdmin(req,res,next) { const pass = req.headers['x-admin-password'] || req.body?.adminPassword || req.query?.adminPassword; if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error:'Admin wachtwoord klopt niet.' }); next(); }
function cleanTag(s) { return String(s||'').toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9à-ÿ]+/gi,'').trim(); }
function detectPlatform(url) { try { const h = new URL(url).hostname.replace('www.','').toLowerCase(); if (h.includes('youtube.com') || h.includes('youtu.be')) return 'youtube'; if (h.includes('facebook.com') || h.includes('fb.watch')) return 'facebook'; return 'link'; } catch { return 'link'; } }
function getYouTubeId(url) { try { const u = new URL(url); if (u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0]; if (u.searchParams.get('v')) return u.searchParams.get('v'); const parts = u.pathname.split('/').filter(Boolean); for (const marker of ['shorts','embed','live']) { const i=parts.indexOf(marker); if(i>=0 && parts[i+1]) return parts[i+1]; } } catch {} return null; }
function pickMeta(html, prop) { const res=[new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,'i'),new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`,'i')]; for(const re of res){ const m=html.match(re); if(m?.[1]) return m[1].replace(/&amp;/g,'&'); } return ''; }
async function fetchOpenGraph(url) { try { const r = await fetch(url, { redirect:'follow', headers:{ 'user-agent':'Mozilla/5.0 KKLIJP preview' }}); const html=await r.text(); return { finalUrl:r.url||url, title:pickMeta(html,'og:title'), description:pickMeta(html,'og:description'), image:pickMeta(html,'og:image')||pickMeta(html,'twitter:image') }; } catch { return { finalUrl:url, title:'', description:'', image:'' }; } }
async function fetchYouTubeMeta(videoId) { if(!YOUTUBE_API_KEY || !videoId) return null; try { const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`; const r=await fetch(apiUrl); if(!r.ok) return null; const data=await r.json(); const s=data.items?.[0]?.snippet; if(!s) return null; return { title:s.title||'', description:s.description||'', tags:Array.isArray(s.tags)?s.tags:[], categoryId:s.categoryId||'', thumbnailUrl:s.thumbnails?.maxres?.url||s.thumbnails?.standard?.url||s.thumbnails?.high?.url||s.thumbnails?.medium?.url||'' }; } catch { return null; } }
function facebookEmbedUrl(url) { return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=1280`; }
function scoreCategory(inputs, ytCat) {
  const text = inputs.join(' ').toLowerCase().replace(/[#_]+/g,' '); const score = Object.fromEntries(categoryIds.map(c=>[c,0]));
  if (ytCat && ytCategoryMap[ytCat]) score[ytCategoryMap[ytCat]] += 6;
  for (const [cat, words] of Object.entries(categoryKeywords)) for (const raw of words) { const w=raw.toLowerCase(); if (text.includes(w.replace(/-/g,' ')) || text.includes(w)) score[cat] += w.length > 6 ? 3 : 2; }
  for (const token of inputs.flatMap(x=>String(x).split(/[\s,#/|;:]+/))) { const clean=cleanTag(token); for (const [cat, words] of Object.entries(categoryKeywords)) if (words.map(cleanTag).includes(clean)) score[cat] += 5; }
  const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0]; return best && best[1] > 0 ? best[0] : 'random';
}
function generateHashtags({ customTitle, platformTitle, description, category, apiTags=[] }) {
  const tags = new Set();
  (categoryKeywords[category]||[]).forEach(w=>{ const t=cleanTag(w); if(t && !stopWords.has(t)) tags.add(t); });
  apiTags.forEach(tag => {
    const whole = cleanTag(tag); if (whole.length>=3 && whole.length<=28 && !stopWords.has(whole)) tags.add(whole);
    String(tag).split(/[\s,;|/#]+/).forEach(p=>{ const t=cleanTag(p); if(t.length>=3 && t.length<=28 && !stopWords.has(t)) tags.add(t); });
  });
  String([customTitle, platformTitle, description].join(' ')).split(/[\s,.;:!?()[\]{}<>"'`~|/#]+/).forEach(w=>{ const t=cleanTag(w); if(t.length>=3 && t.length<=28 && !stopWords.has(t)) { tags.add(t); (synonyms[t]||[]).forEach(s=>{ const x=cleanTag(s); if(x&&!stopWords.has(x)) tags.add(x); }); }});
  return Array.from(tags).filter(Boolean).slice(0,50);
}
async function buildVideoData(url, customTitle, postedBy) {
  let platform = detectPlatform(url); let finalUrl = url; let og = { title:'', description:'', image:'' };
  if (platform === 'facebook' || platform === 'link') { og = await fetchOpenGraph(url); finalUrl = og.finalUrl || url; platform = detectPlatform(finalUrl); }
  const ytId = platform === 'youtube' ? getYouTubeId(finalUrl) : null;
  const yt = ytId ? await fetchYouTubeMeta(ytId) : null;
  const platformTitle = yt?.title || og.title || '';
  const description = yt?.description || og.description || '';
  const category = scoreCategory([customTitle, platformTitle, description, ...(yt?.tags||[])], yt?.categoryId);
  const hashtags = generateHashtags({ customTitle, platformTitle, description, category, apiTags: yt?.tags || [] });
  const thumbnailUrl = platform === 'youtube' && ytId ? (yt?.thumbnailUrl || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`) : (og.image || '');
  const embedUrl = platform === 'youtube' && ytId ? `https://www.youtube.com/embed/${ytId}` : platform === 'facebook' ? facebookEmbedUrl(finalUrl) : finalUrl;
  return { id:`v-${Date.now()}-${Math.random().toString(16).slice(2)}`, url:finalUrl, platform, platformId:ytId||'', title: customTitle || platformTitle || 'Zonder titel', platformTitle, description, thumbnailUrl, embedUrl, category, hashtags, postedBy, likes:0, views:0, comments:[], status:'pending', createdAt:new Date().toISOString() };
}
function publicVideo(v) { return v; }

app.get('/api/categories', async (req,res)=>{ const db=await readDb(); const approved=db.videos.filter(v=>(v.status||'approved')==='approved'); res.json(categories.map(c=>({ ...c, count: c.id==='all' ? approved.length : approved.filter(v=>v.category===c.id).length }))); });
app.post('/api/session', async (req,res)=>{ const db=await readDb(); try { const username = await claimOrCheckUser(db, req, req.body?.name); await writeDb(db); res.json({ username }); } catch(e){ res.status(409).json({ error:e.message }); } });
app.get('/api/videos', async (req,res)=>{ const db=await readDb(); let rows=db.videos.filter(v=>(v.status||'approved')==='approved'); const { q='', category='all', sort='date', order='desc' } = req.query; if(category && category!=='all') rows=rows.filter(v=>v.category===category); if(q){ const needle=String(q).toLowerCase().replace(/^#/,''); rows=rows.filter(v=>[v.title,v.postedBy,v.platform,v.category,...(v.hashtags||[])].join(' ').toLowerCase().includes(needle)); } const dir=order==='asc'?1:-1; rows.sort((a,b)=>{ if(sort==='likes') return dir*((a.likes||0)-(b.likes||0)); if(sort==='views') return dir*((a.views||0)-(b.views||0)); if(sort==='name') return dir*String(a.title).localeCompare(String(b.title)); return dir*(new Date(a.createdAt)-new Date(b.createdAt)); }); res.json(rows.map(publicVideo)); });
app.get('/api/videos/:id', async (req,res)=>{ const db=await readDb(); const v=db.videos.find(x=>x.id===req.params.id && (x.status||'approved')==='approved'); if(!v) return res.status(404).json({ error:'Niet gevonden.' }); res.json(v); });
app.post('/api/videos', async (req,res)=>{ if(!floodCheck(req,'upload',3,10*60*1000)) return res.status(429).json({ error:'Te veel uploads. Wacht even en probeer opnieuw.' }); const { name, url, title } = req.body || {}; if(!url) return res.status(400).json({ error:'Plak een videolink.' }); const db=await readDb(); try { const username=await claimOrCheckUser(db, req, name); const video=await buildVideoData(url, String(title||'').trim().slice(0,120), username); db.videos.push(video); await writeDb(db); res.status(201).json(video); } catch(e){ res.status(409).json({ error:e.message }); } });
app.post('/api/videos/:id/view', async (req,res)=>{ const db=await readDb(); const v=db.videos.find(x=>x.id===req.params.id && (x.status||'approved')==='approved'); if(!v) return res.status(404).json({ error:'Niet gevonden.' }); v.views=(v.views||0)+1; await writeDb(db); res.json(v); });
app.post('/api/videos/:id/like', async (req,res)=>{ const db=await readDb(); try { const username=await claimOrCheckUser(db, req, req.body?.name); const v=db.videos.find(x=>x.id===req.params.id && (x.status||'approved')==='approved'); if(!v) return res.status(404).json({ error:'Niet gevonden.' }); db.likes[v.id] ||= []; if(!db.likes[v.id].includes(username)){ db.likes[v.id].push(username); v.likes=(v.likes||0)+1; } await writeDb(db); res.json(v); } catch(e){ res.status(409).json({ error:e.message }); } });
app.post('/api/videos/:id/comments', async (req,res)=>{ if(!floodCheck(req,'comment',5,2*60*1000)) return res.status(429).json({ error:'Te veel reacties. Wacht even en probeer opnieuw.' }); const text=String(req.body?.text||'').trim().slice(0,500); if(!text) return res.status(400).json({ error:'Typ een reactie.' }); const db=await readDb(); try { const username=await claimOrCheckUser(db, req, req.body?.name); const v=db.videos.find(x=>x.id===req.params.id && (x.status||'approved')==='approved'); if(!v) return res.status(404).json({ error:'Niet gevonden.' }); v.comments ||= []; v.comments.push({ id:`c-${Date.now()}-${Math.random().toString(16).slice(2)}`, name:username, text, createdAt:new Date().toISOString() }); await writeDb(db); res.status(201).json(v); } catch(e){ res.status(409).json({ error:e.message }); } });
app.get('/api/trending', async (req,res)=>{ const db=await readDb(); const tags={}; db.videos.filter(v=>(v.status||'approved')==='approved').forEach(v=>(v.hashtags||[]).forEach(t=>{ if(!stopWords.has(t)) tags[t]=(tags[t]||0)+Math.max(1,v.views||0)+(v.likes||0)*4; })); res.json(Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,16).map(([tag,score])=>({tag,score}))); });
app.get('/api/top', async (req,res)=>{ const db=await readDb(); res.json(db.videos.filter(v=>(v.status||'approved')==='approved').sort((a,b)=>((b.views||0)+(b.likes||0)*12+(b.comments?.length||0)*8)-((a.views||0)+(a.likes||0)*12+(a.comments?.length||0)*8)).slice(0,6)); });
app.get('/api/admin/videos', requireAdmin, async (req,res)=>{ const db=await readDb(); const status=req.query.status||'all'; const rows=status==='all'?db.videos:db.videos.filter(v=>(v.status||'approved')===status); res.json(rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))); });
app.patch('/api/admin/videos/:id', requireAdmin, async (req,res)=>{ const db=await readDb(); const v=db.videos.find(x=>x.id===req.params.id); if(!v) return res.status(404).json({ error:'Niet gevonden.' }); for(const k of ['title','category','hashtags','status','thumbnailUrl','embedUrl','url']) if(k in req.body) v[k] = k==='hashtags' ? String(req.body[k]).split(/[\s,#]+/).map(cleanTag).filter(Boolean).slice(0,60) : req.body[k]; if(req.body.status==='approved' && !v.approvedAt) v.approvedAt=new Date().toISOString(); await writeDb(db); res.json(v); });
app.post('/api/admin/videos/:id/approve', requireAdmin, async (req,res)=>{ const db=await readDb(); const v=db.videos.find(x=>x.id===req.params.id); if(!v) return res.status(404).json({ error:'Niet gevonden.' }); v.status='approved'; v.approvedAt=new Date().toISOString(); await writeDb(db); res.json(v); });
app.delete('/api/admin/videos/:id', requireAdmin, async (req,res)=>{ const db=await readDb(); db.videos=db.videos.filter(x=>x.id!==req.params.id); delete db.likes[req.params.id]; await writeDb(db); res.json({ ok:true }); });

app.listen(PORT, ()=>console.log(`KKLIJP API v1.4 draait op http://localhost:${PORT}`));
