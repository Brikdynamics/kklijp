import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const distPath = path.join(root, 'dist');
const legacyDbPath = path.join(__dirname, 'data', 'db.json');
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.KKLIJP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'ADMIN2026';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

const categories = [
  {id:'all',label:'Alles'}, {id:'reels',label:'Reels'}, {id:'painful',label:'Pijnlijk'}, {id:'risky',label:'Riskant'}, {id:'inventive',label:'Uitvindingen'}, {id:'games',label:'Games'}, {id:'lifehacks',label:'Lifehacks'}, {id:'skills',label:'Skills'}, {id:'hotties',label:'Hotties'}, {id:'wtf',label:'WTF'}, {id:'fails',label:'Fails'}, {id:'random',label:'Random'}
];
const catIds = categories.filter(c=>!['all','reels'].includes(c.id)).map(c=>c.id);
const categoryKeywords = {
 painful:['fail','crash','hurt','pain','broken','injury','ouch','slam','fall','wipeout','faceplant','pijn','pijnlijk','auw','val','ongeluk','klap','botsing'],
 risky:['danger','risk','risky','extreme','jump','roof','rooftop','stunt','cliff','parkour','speed','almost','gevaar','riskant','sprong','dak','bijna'],
 inventive:['invent','invention','build','machine','creative','homemade','engineering','robot','tool','gadget','uitvinding','bouwen','zelfgemaakt','slim','creatief'],
 games:['game','gaming','gamer','clutch','minecraft','fortnite','cod','gta','speedrun','xbox','playstation','valorant','csgo'],
 lifehacks:['lifehack','hack','trick','tip','easy','smart','solution','kitchen','repair','cleaning','howto','tutorial','diy','handig','truc','oplossing'],
 skills:['skill','talent','perfect','freestyle','trickshot','football','soccer','basketball','dance','artist','magic','juggle','control','precision','vaardigheid','voetbal','dans'],
 hotties:['hot','hottie','babe','girl','model','pool','beach','summer','fit','fitness','beauty','cute','bikini','fashion','glamour'],
 wtf:['wtf','weird','crazy','unexpected','strange','bizarre','wild','unreal','confusing','odd','madness'],
 fails:['fail','fails','failed','oops','epicfail','wrong','karma','mistake','blooper','disaster','instantkarma'],
 random:['meme','funny','lol','reaction','animal','dog','cat','street','party','news','moment','grappig','dier','hond','kat']
};
const stopWords = new Set('de het een en of op met van voor naar in is zijn was ben door over deze dit dat maar als kan kun geen wel je jij jouw jullie onze mijn wij hij zij the and or with from this that reel reels shorts youtube facebook watch official clip clips full new old best top very echt gewoon heel daar waar wanneer hoe waarom niet wel bij uit zonder upload kijk deel kklijp video viral fyp'.split(' '));
const ytCategoryMap = {'20':'games','17':'skills','26':'lifehacks','28':'inventive','24':'random','22':'random','23':'random'};
const flood = new Map();
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};

function send(res, status, data){ const body = JSON.stringify(data); res.writeHead(status, {'content-type':'application/json; charset=utf-8'}); res.end(body); }
function parseUrl(req){ return new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
async function body(req){ let b=''; for await (const c of req) b+=c; try{return b?JSON.parse(b):{}}catch{return {}} }
function clientIp(req){ return String(req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || 'unknown'; }
function floodCheck(req, action, limit, ms){ const key=action+':'+clientIp(req), now=Date.now(); const hits=(flood.get(key)||[]).filter(t=>now-t<ms); if(hits.length>=limit) return false; hits.push(now); flood.set(key,hits); return true; }
const DATABASE_URL = process.env.DATABASE_URL || '';
const PGSSL = String(process.env.PGSSL ?? 'true').toLowerCase() !== 'false';
const pool = DATABASE_URL ? new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSL ? { rejectUnauthorized: false } : false
}) : null;
let dbReady = false;

function requireDb(){
  if(!pool) throw new Error('DATABASE_URL ontbreekt. Koppel Railway Postgres of Supabase Postgres en zet DATABASE_URL in je environment variables.');
}

async function ensureDb(){
  requireDb();
  if(dbReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kklijp_users (
      username_lower TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      ip TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS kklijp_videos (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      type TEXT NOT NULL DEFAULT 'video',
      category TEXT NOT NULL DEFAULT 'random',
      title TEXT NOT NULL DEFAULT '',
      posted_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_kklijp_videos_status ON kklijp_videos(status);
    CREATE INDEX IF NOT EXISTS idx_kklijp_videos_type ON kklijp_videos(type);
    CREATE INDEX IF NOT EXISTS idx_kklijp_videos_category ON kklijp_videos(category);
    CREATE TABLE IF NOT EXISTS kklijp_likes (
      video_id TEXT NOT NULL REFERENCES kklijp_videos(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      PRIMARY KEY(video_id, username)
    );
  `);
  dbReady = true;

  // Eenmalige migratie: als er nog een oude JSON-database in de zip zit en Postgres leeg is,
  // importeer die automatisch. Daarna wordt alleen Postgres gebruikt.
  try{
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM kklijp_videos');
    if(count.rows[0].n === 0){
      const raw = await fs.readFile(legacyDbPath, 'utf8');
      const legacy = JSON.parse(raw);
      if(Array.isArray(legacy.videos) && legacy.videos.length){
        await writeDb({videos: legacy.videos, users: legacy.users || {}, likes: legacy.likes || {}});
        console.log(`KKLIJP: ${legacy.videos.length} oude JSON-video's geïmporteerd naar Postgres.`);
      }
    }
  }catch{}
}

async function readDb(){
  await ensureDb();
  const [vr, ur, lr] = await Promise.all([
    pool.query('SELECT data FROM kklijp_videos ORDER BY created_at DESC'),
    pool.query('SELECT username_lower, username, ip, created_at, last_seen_at FROM kklijp_users'),
    pool.query('SELECT video_id, username FROM kklijp_likes')
  ]);
  const users = {};
  for(const r of ur.rows){
    users[r.username_lower] = {
      username: r.username,
      ip: r.ip,
      createdAt: r.created_at?.toISOString?.() || r.created_at,
      lastSeenAt: r.last_seen_at?.toISOString?.() || r.last_seen_at
    };
  }
  const likes = {};
  for(const r of lr.rows){
    likes[r.video_id] ||= [];
    likes[r.video_id].push(r.username);
  }
  return { videos: vr.rows.map(r => r.data), users, likes };
}

async function writeDb(db){
  await ensureDb();
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM kklijp_likes');
    await client.query('DELETE FROM kklijp_videos');
    await client.query('DELETE FROM kklijp_users');

    for(const [key,u] of Object.entries(db.users || {})){
      await client.query(
        `INSERT INTO kklijp_users(username_lower, username, ip, created_at, last_seen_at)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(username_lower) DO UPDATE SET username=EXCLUDED.username, ip=EXCLUDED.ip, last_seen_at=EXCLUDED.last_seen_at`,
        [key, u.username || key, u.ip || 'unknown', u.createdAt || new Date().toISOString(), u.lastSeenAt || new Date().toISOString()]
      );
    }

    for(const v of db.videos || []){
      await client.query(
        `INSERT INTO kklijp_videos(id, data, status, type, category, title, posted_by, created_at)
         VALUES($1,$2::jsonb,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, status=EXCLUDED.status, type=EXCLUDED.type, category=EXCLUDED.category, title=EXCLUDED.title, posted_by=EXCLUDED.posted_by`,
        [v.id, JSON.stringify(v), v.status || 'approved', v.type || 'video', v.category || 'random', v.title || '', v.postedBy || '', v.createdAt || new Date().toISOString()]
      );
    }

    for(const [videoId,names] of Object.entries(db.likes || {})){
      for(const username of names || []){
        await client.query('INSERT INTO kklijp_likes(video_id, username) VALUES($1,$2) ON CONFLICT DO NOTHING', [videoId, username]);
      }
    }

    await client.query('COMMIT');
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{
    client.release();
  }
}
function normalizeName(n){ return String(n||'').trim().replace(/\s+/g,' ').slice(0,32); }
async function claim(db, req, name){ const username=normalizeName(name); if(!username) throw new Error('Vul een naam in.'); const key=username.toLowerCase(), ip=clientIp(req); const ex=db.users[key]; if(ex && ex.ip!==ip) throw new Error(`Naam "${username}" is al in gebruik. Kies een andere naam.`); db.users[key] = {username, ip, createdAt: ex?.createdAt || new Date().toISOString(), lastSeenAt:new Date().toISOString()}; return username; }
function adminOk(req){ return req.headers['x-admin-password'] === ADMIN_PASSWORD; }
function cleanTag(s){ return String(s||'').toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9à-ÿ]+/gi,'').trim(); }
function platform(url){ try{const h=new URL(url).hostname.replace('www.','').toLowerCase(); if(h.includes('youtube.com')||h.includes('youtu.be'))return 'youtube'; if(h.includes('facebook.com')||h.includes('fb.watch'))return 'facebook'; return 'link'}catch{return 'link'} }
function youtubeId(url){ try{const u=new URL(url); if(u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0]; if(u.searchParams.get('v')) return u.searchParams.get('v'); const parts=u.pathname.split('/').filter(Boolean); for(const m of ['shorts','embed','live']){const i=parts.indexOf(m); if(i>=0&&parts[i+1]) return parts[i+1];}}catch{} return '' }
function detectType(url){ const l=String(url).toLowerCase(); return (l.includes('/shorts/')||l.includes('/reel/')||l.includes('facebook.com/reel')||l.includes('/share/r/'))?'reel':'video'; }
function meta(html,prop){ const pats=[new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,'i'),new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`,'i')]; for(const p of pats){const m=html.match(p); if(m?.[1]) return m[1].replace(/&amp;/g,'&')} return '' }
async function openGraph(url){ try{const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 KKLIJP'}}); const html=await r.text(); return {finalUrl:r.url||url,title:meta(html,'og:title'),description:meta(html,'og:description'),image:meta(html,'og:image')||meta(html,'twitter:image')}}catch{return {finalUrl:url,title:'',description:'',image:''}} }
async function ytMeta(id){ if(!YOUTUBE_API_KEY||!id)return null; try{const r=await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(id)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`); if(!r.ok)return null; const s=(await r.json()).items?.[0]?.snippet; if(!s)return null; return {title:s.title||'',description:s.description||'',tags:Array.isArray(s.tags)?s.tags:[],categoryId:s.categoryId||'',thumbnailUrl:s.thumbnails?.maxres?.url||s.thumbnails?.standard?.url||s.thumbnails?.high?.url||s.thumbnails?.medium?.url||''}}catch{return null} }
function scoreCategory(inputs, ytCat){ const text=inputs.join(' ').toLowerCase().replace(/[#_]+/g,' '); const score=Object.fromEntries(catIds.map(c=>[c,0])); if(ytCat&&ytCategoryMap[ytCat]) score[ytCategoryMap[ytCat]]+=6; for(const [cat,words] of Object.entries(categoryKeywords)) for(const raw of words){const w=raw.toLowerCase(); if(text.includes(w)) score[cat]+=w.length>6?3:2} const best=Object.entries(score).sort((a,b)=>b[1]-a[1])[0]; return best&&best[1]>0?best[0]:'random'; }
function tags({customTitle,platformTitle,description,category,apiTags=[]}){ const set=new Set(); (categoryKeywords[category]||[]).forEach(w=>{const t=cleanTag(w); if(t&&!stopWords.has(t))set.add(t)}); [...apiTags, customTitle, platformTitle, description].join(' ').split(/[\s,.;:!?()[\]{}<>"'`~|/#]+/).forEach(w=>{const t=cleanTag(w); if(t.length>=3&&t.length<=28&&!stopWords.has(t))set.add(t)}); return [...set].slice(0,50); }
function fbEmbed(url){return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=500`}
async function buildVideo(url, customTitle, postedBy){ let finalUrl=url, p=platform(url), og={title:'',description:'',image:''}; if(p==='facebook'||p==='link'){ og=await openGraph(url); finalUrl=og.finalUrl||url; p=platform(finalUrl); } const ytId=p==='youtube'?youtubeId(finalUrl):''; const yt=ytId?await ytMeta(ytId):null; const platformTitle=yt?.title||og.title||''; const description=yt?.description||og.description||''; const category=scoreCategory([customTitle,platformTitle,description,...(yt?.tags||[])], yt?.categoryId); const type=detectType(finalUrl); const thumbnailUrl=p==='youtube'&&ytId?(yt?.thumbnailUrl||`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`):(og.image||''); const embedUrl=p==='youtube'&&ytId?`https://www.youtube.com/embed/${ytId}`:p==='facebook'?fbEmbed(finalUrl):finalUrl; return {id:`v-${Date.now()}-${Math.random().toString(16).slice(2)}`,url:finalUrl,platform:p,platformId:ytId,title:customTitle||platformTitle||'Titel later aanpassen',platformTitle,description,thumbnailUrl,embedUrl,category,hashtags:tags({customTitle,platformTitle,description,category,apiTags:yt?.tags||[]}),postedBy,type,likes:0,views:0,comments:[],status:'pending',createdAt:new Date().toISOString()}; }
function sortRows(rows, sort, order){ const dir=order==='asc'?1:-1; return rows.sort((a,b)=>{ if(sort==='likes')return dir*((a.likes||0)-(b.likes||0)); if(sort==='views')return dir*((a.views||0)-(b.views||0)); if(sort==='name')return dir*String(a.title).localeCompare(String(b.title)); return dir*(new Date(a.createdAt)-new Date(b.createdAt));}); }
function topScore(v){ return (v.views||0)+(v.likes||0)*12+(v.comments?.length||0)*8; }

async function apiRoute(req,res,u){
 const db=await readDb();
 if(req.method==='GET'&&u.pathname==='/api/categories'){ const approved=db.videos.filter(v=>(v.status||'approved')==='approved'); return send(res,200,categories.map(c=>({...c,count:c.id==='all'?approved.length:c.id==='reels'?approved.filter(v=>v.type==='reel').length:approved.filter(v=>v.category===c.id&&v.type!=='reel').length}))); }
 if(req.method==='POST'&&u.pathname==='/api/session'){ try{const username=await claim(db,req,(await body(req)).name); await writeDb(db); return send(res,200,{username})}catch(e){return send(res,409,{error:e.message})} }
 if(req.method==='GET'&&u.pathname==='/api/videos'){ let rows=db.videos.filter(v=>(v.status||'approved')==='approved'); const q=u.searchParams.get('q')||'', category=u.searchParams.get('category')||'all', sort=u.searchParams.get('sort')||'date', order=u.searchParams.get('order')||'desc', type=u.searchParams.get('type')||''; if(type) rows=rows.filter(v=>(v.type||'video')===type); if(category&&category!=='all'&&category!=='reels') rows=rows.filter(v=>v.category===category); if(category==='reels') rows=rows.filter(v=>v.type==='reel'); if(q){const n=q.toLowerCase().replace(/^#/,''); rows=rows.filter(v=>[v.title,v.postedBy,v.platform,v.category,v.type,...(v.hashtags||[])].join(' ').toLowerCase().includes(n));} return send(res,200,sortRows(rows,sort,order)); }
 const idMatch=u.pathname.match(/^\/api\/videos\/([^/]+)$/); if(req.method==='GET'&&idMatch){ const v=db.videos.find(x=>x.id===idMatch[1]&&(x.status||'approved')==='approved'); return v?send(res,200,v):send(res,404,{error:'Niet gevonden.'}); }
 if(req.method==='POST'&&u.pathname==='/api/videos'){ if(!floodCheck(req,'upload',3,10*60*1000))return send(res,429,{error:'Te veel uploads. Wacht even.'}); const b=await body(req); if(!b.url)return send(res,400,{error:'Plak een videolink.'}); try{const username=await claim(db,req,b.name); const v=await buildVideo(b.url,String(b.title||'').trim().slice(0,120),username); db.videos.push(v); await writeDb(db); return send(res,201,v)}catch(e){return send(res,409,{error:e.message})} }
 const act=u.pathname.match(/^\/api\/videos\/([^/]+)\/(view|like|comments)$/); if(req.method==='POST'&&act){ const v=db.videos.find(x=>x.id===act[1]&&(x.status||'approved')==='approved'); if(!v)return send(res,404,{error:'Niet gevonden.'}); if(act[2]==='view'){v.views=(v.views||0)+1; await writeDb(db); return send(res,200,v)} const b=await body(req); if(act[2]==='like'){try{const username=await claim(db,req,b.name); db.likes[v.id] ||= []; if(!db.likes[v.id].includes(username)){db.likes[v.id].push(username); v.likes=(v.likes||0)+1} await writeDb(db); return send(res,200,v)}catch(e){return send(res,409,{error:e.message})}} if(act[2]==='comments'){if(!floodCheck(req,'comment',5,2*60*1000))return send(res,429,{error:'Te veel reacties. Wacht even.'}); const text=String(b.text||'').trim().slice(0,500); if(!text)return send(res,400,{error:'Typ een reactie.'}); try{const username=await claim(db,req,b.name); v.comments ||= []; v.comments.push({id:`c-${Date.now()}-${Math.random().toString(16).slice(2)}`,name:username,text,createdAt:new Date().toISOString()}); await writeDb(db); return send(res,201,v)}catch(e){return send(res,409,{error:e.message})}} }
 if(req.method==='GET'&&u.pathname==='/api/top'){ const type=u.searchParams.get('type'); let rows=db.videos.filter(v=>(v.status||'approved')==='approved'); if(type) rows=rows.filter(v=>(v.type||'video')===type); return send(res,200,rows.sort((a,b)=>topScore(b)-topScore(a)).slice(0,8)); }
 if(u.pathname.startsWith('/api/admin/')){ if(!adminOk(req))return send(res,401,{error:'Admin wachtwoord klopt niet.'}); if(req.method==='POST'&&u.pathname==='/api/admin/check')return send(res,200,{ok:true}); if(req.method==='GET'&&u.pathname==='/api/admin/videos'){ const status=u.searchParams.get('status')||'all'; const rows=status==='all'?db.videos:db.videos.filter(v=>(v.status||'approved')===status); return send(res,200,rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))); }
  if(req.method==='POST'&&u.pathname==='/api/admin/batch'){ const b=await body(req); const lines=String(b.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,200); let added=0; for(const line of lines){const parts=line.split('|').map(x=>x.trim()); const link=parts[0], title=parts[1]||'', name=parts[2]||'brikdynamics'; if(/^https?:\/\//i.test(link)){db.videos.push(await buildVideo(link,title,name)); added++;}} await writeDb(db); return send(res,200,{added}); }
  const adm=u.pathname.match(/^\/api\/admin\/videos\/([^/]+)(?:\/(approve))?$/); if(adm){ const v=db.videos.find(x=>x.id===adm[1]); if(!v)return send(res,404,{error:'Niet gevonden.'}); if(req.method==='POST'&&adm[2]==='approve'){v.status='approved'; v.approvedAt=new Date().toISOString(); await writeDb(db); return send(res,200,v)} if(req.method==='DELETE'){db.videos=db.videos.filter(x=>x.id!==adm[1]); delete db.likes[adm[1]]; await writeDb(db); return send(res,200,{ok:true})} if(req.method==='PATCH'){const b=await body(req); for(const k of ['title','category','hashtags','status','thumbnailUrl','embedUrl','url','postedBy','type']) if(k in b) v[k]=k==='hashtags'?String(b[k]).split(/[\s,#]+/).map(cleanTag).filter(Boolean).slice(0,60):b[k]; if(v.type==='reel') v.type='reel'; await writeDb(db); return send(res,200,v)} }
 }
 return send(res,404,{error:'Niet gevonden.'});
}
async function staticFile(req,res,u){ let safe=decodeURIComponent(u.pathname.split('?')[0]); if(safe==='/'||safe==='/reels'||safe==='/admin') safe='/index.html'; let fp=path.normalize(path.join(distPath,safe)); if(!fp.startsWith(distPath)) fp=path.join(distPath,'index.html'); try{const buf=await fs.readFile(fp); const ext=path.extname(fp); res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream'}); res.end(buf)}catch{const buf=await fs.readFile(path.join(distPath,'index.html')); res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); res.end(buf)} }
const server=http.createServer(async (req,res)=>{ try{const u=parseUrl(req); if(u.pathname.startsWith('/api/')) return await apiRoute(req,res,u); return await staticFile(req,res,u);}catch(e){console.error(e); send(res,500,{error:e.message || 'Serverfout'})} });
ensureDb().then(()=>console.log('KKLIJP database klaar.')).catch(e=>console.error('KKLIJP database waarschuwing:', e.message));
server.listen(PORT,()=>console.log('KKLIJP v3 database build live op poort',PORT));
