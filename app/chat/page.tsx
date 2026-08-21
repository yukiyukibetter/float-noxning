"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const SB = "https://qaefaadqtqndchmgtgat.supabase.co";
const SK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZWZhYWRxdHFuZGNobWd0Z2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjM2NzEsImV4cCI6MjA4ODg5OTY3MX0.LFCLgMioMb7Je5yVyVLoEfdctzqJrNTfu0vnvfr5Fa4";
const H:{[k:string]:string} = { "Content-Type": "application/json", apikey: SK, Authorization: `Bearer ${SK}` };
const api = (p: string) => `${SB}/rest/v1/${p}`;
interface M { id: number; sender: string; content: string; created_at: string; }
const compressImg = (file: File, max = 200): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("读取失败")); reader.onload = () => { const img = new Image(); img.onerror = () => reject(new Error("图片加载失败")); img.onload = () => { const c = document.createElement("canvas"); let w = img.width, h = img.height; if (w > h) { h = max * h / w; w = max; } else { w = max * w / h; h = max; } c.width = w; c.height = h; c.getContext("2d")!.drawImage(img, 0, 0, w, h); resolve(c.toDataURL("image/jpeg", 0.85)); }; img.src = reader.result as string; }; reader.readAsDataURL(file); });
const cfgGet = async (): Promise<Record<string,string>> => { try { const r = await fetch(api("float_config?select=key,value"), { headers: H }); if (!r.ok) return {}; const rows: {key:string;value:string}[] = await r.json(); const m: Record<string,string> = {}; for (const {key,value} of rows) m[key] = value; return m; } catch { return {}; } };
const cfgSet = async (key: string, value: string) => { try { await fetch(api("float_config"), { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) }); } catch {} };
const safeTop = { paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" };

export default function Chat() {
  const [msgs, setMsgs] = useState<M[]>([]); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<"chat"|"settings">("chat"); const [css, setCss] = useState("");
  const [avNox, setAvNox] = useState(""); const [avNing, setAvNing] = useState(""); const [wall, setWall] = useState("");
  const [name, setName] = useState("澈澈♡"); const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null); const ids = useRef(new Set<number>());

  useEffect(() => { (async () => { try { setCss(localStorage.getItem("nn-css") || ""); setAvNox(localStorage.getItem("nn-av-nox") || ""); setAvNing(localStorage.getItem("nn-av-ning") || ""); setWall(localStorage.getItem("nn-wall") || ""); setName(localStorage.getItem("nn-name") || "澈澈♡"); } catch {} const cfg = await cfgGet(); if (cfg.av_nox) { setAvNox(cfg.av_nox); try { localStorage.setItem("nn-av-nox", cfg.av_nox); } catch {} } if (cfg.av_ning) { setAvNing(cfg.av_ning); try { localStorage.setItem("nn-av-ning", cfg.av_ning); } catch {} } if (cfg.name) { setName(cfg.name); try { localStorage.setItem("nn-name", cfg.name); } catch {} } if (cfg.wall) { setWall(cfg.wall); try { localStorage.setItem("nn-wall", cfg.wall); } catch {} } setReady(true); })(); }, []);

  useEffect(() => { const fix = () => { document.querySelectorAll<HTMLElement>('.chat-msg-wrapper[data-role="user"]').forEach(el => { el.style.setProperty('flex-direction', 'row-reverse', 'important'); el.style.setProperty('justify-content', 'flex-start', 'important'); }); document.querySelectorAll<HTMLElement>('.chat-msg-wrapper[data-role="assistant"]').forEach(el => { el.style.setProperty('flex-direction', 'row', 'important'); el.style.setProperty('justify-content', 'flex-start', 'important'); }); }; const obs = new MutationObserver(fix); const container = ref.current; if (container) { obs.observe(container, { childList: true, subtree: true }); fix(); } return () => obs.disconnect(); }, [ready]);

  const load = useCallback(async () => { try { const r = await fetch(api("float_messages?order=created_at.desc&limit=100"), { headers: { ...H, Prefer: "" } }); if (!r.ok) return; const d: M[] = await r.json(); d.reverse(); let nw = false; for (const m of d) { if (!ids.current.has(m.id)) { nw = true; ids.current.add(m.id); } } setMsgs(d); if (nw) setTimeout(() => ref.current?.scrollTo(0, ref.current.scrollHeight), 60); } catch {} }, []);
  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, [load]);

  const send = async () => { const t = input.trim(); if (!t || busy) return; setBusy(true); setInput(""); setMsgs(p => [...p, { id: -Date.now(), sender: "ning", content: t, created_at: new Date().toISOString() }]); setTimeout(() => ref.current?.scrollTo(0, ref.current.scrollHeight), 60); try { await fetch(api("float_messages"), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ sender: "ning", content: t }) }); load(); } catch {} setBusy(false); };

  const pickAvatar = (who: "nox" | "ning") => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; try { const b64 = await compressImg(f); if (who === "nox") setAvNox(b64); else setAvNing(b64); } catch {} }; inp.click(); };

  const save = async () => { try { localStorage.setItem("nn-css", css); localStorage.setItem("nn-av-nox", avNox); localStorage.setItem("nn-av-ning", avNing); localStorage.setItem("nn-wall", wall); localStorage.setItem("nn-name", name); } catch {} await Promise.all([cfgSet("av_nox", avNox), cfgSet("av_ning", avNing), cfgSet("name", name), cfgSet("wall", wall)]); setPage("chat"); };

  const time = (ts: string) => { try { const d = new Date(ts), now = new Date(); const hm = `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`; if (d.toDateString() === now.toDateString()) return hm; const yd = new Date(now); yd.setDate(now.getDate()-1); if (d.toDateString() === yd.toDateString()) return `昨天 ${hm}`; return `${d.getMonth()+1}月${d.getDate()}日 ${hm}`; } catch { return ""; } };
  const dateL = (ts: string) => { try { const d = new Date(ts), t = new Date(); if (d.toDateString()===t.toDateString()) return "今天"; const y = new Date(t); y.setDate(t.getDate()-1); if (d.toDateString()===y.toDateString()) return "昨天"; return `${d.getMonth()+1}月${d.getDate()}日`; } catch { return ""; } };

  const noxAv = (s: number) => avNox ? <img src={avNox} alt="" style={{width:s,height:s,borderRadius:s/2,objectFit:"cover"}} /> : <div style={{width:s,height:s,borderRadius:s/2,background:"#e8e8e8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:s*0.4}}>♡</div>;
  const ningAv = (s: number) => avNing ? <img src={avNing} alt="" style={{width:s,height:s,borderRadius:s/2,objectFit:"cover"}} /> : <div style={{width:s,height:s,borderRadius:s/2,background:"#e8e8e8",display:"flex",alignItems:"center",justifyContent:"center"}}><svg viewBox="0 0 24 24" width={s*0.5} height={s*0.5} fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;

  const avatarPreview = (who: "nox" | "ning", src: string, label: string) => (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0"}}>
      <div style={{width:56,height:56,borderRadius:28,overflow:"hidden",flexShrink:0,border:"2px solid rgba(214,90,124,0.3)"}}>
        {src ? <img src={src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <div style={{width:"100%",height:"100%",background:"#e8e8e8",display:"flex",alignItems:"center",justifyContent:"center",color:"#999",fontSize:13}}>{who==="nox"?"♡":"?"}</div>}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
        <span style={{fontSize:14,fontWeight:600,color:"var(--c-text-title,#333)"}}>{label}</span>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>pickAvatar(who)} style={{padding:"6px 14px",borderRadius:20,border:"1px solid rgba(214,90,124,0.4)",background:"rgba(214,90,124,0.08)",color:"#D65A7C",fontSize:13,fontWeight:500,cursor:"pointer"}}>📷 选择图片</button>
          {src && <button onClick={()=>{if(who==="nox")setAvNox("");else setAvNing("");}} style={{padding:"6px 12px",borderRadius:20,border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#999",fontSize:13,cursor:"pointer"}}>清除</button>}
        </div>
      </div>
    </div>
  );

  if (page === "settings") return (
    <div className="chat-app" style={{height:"100dvh",display:"flex",flexDirection:"column",background:"var(--c-page-body-bg,#f5f5f5)"}}>
      <style>{css}</style>
      <div className="page-header" style={{...safeTop,paddingLeft:16,paddingRight:16,paddingBottom:14,display:"flex",alignItems:"center",gap:12,background:"var(--c-header-bg,#f2f2f2)",borderBottom:"1px solid rgba(0,0,0,0.08)",flexShrink:0}}>
        <button onClick={()=>setPage("chat")} className="page-back-btn" style={{background:"none",border:"none",fontSize:18,cursor:"pointer",padding:"4px 8px",color:"var(--c-text,#333)"}}>←</button>
        <span className="page-title" style={{fontSize:16,fontWeight:600,color:"var(--c-text-title,#000)"}}>⚙ 设置</span>
      </div>
      <div style={{flex:1,overflow:"auto",padding:16,display:"flex",flexDirection:"column",gap:14}}>
        <div><label style={{fontSize:13,fontWeight:600,marginBottom:4,display:"block",color:"var(--c-text-title,#333)"}}>澈澈的名字</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="澈澈♡" style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,boxSizing:"border-box",background:"var(--c-input,#f0f0f0)",color:"var(--c-text,#333)"}} /></div>
        {avatarPreview("nox", avNox, "澈澈的头像")}
        {avatarPreview("ning", avNing, "凝凝的头像")}
        <div><label style={{fontSize:13,fontWeight:600,marginBottom:4,display:"block",color:"var(--c-text-title,#333)"}}>聊天背景图 URL</label><input value={wall} onChange={e=>setWall(e.target.value)} placeholder="图片URL或留空" style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,boxSizing:"border-box",background:"var(--c-input,#f0f0f0)",color:"var(--c-text,#333)"}} /></div>
        <div><label style={{fontSize:13,fontWeight:600,marginBottom:4,display:"block",color:"var(--c-text-title,#333)"}}>自定义 CSS 主题</label><p style={{fontSize:12,color:"#999",margin:"0 0 6px"}}>粘贴 Float 社区 CSS 主题代码，class 名完全兼容 ✔（CSS主题仅存本地）</p><textarea value={css} onChange={e=>setCss(e.target.value)} placeholder="/* 粘贴主题CSS */" style={{width:"100%",height:200,padding:12,borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:13,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box",background:"var(--c-input,#f0f0f0)",color:"var(--c-text,#333)"}} /></div>
        <button onClick={save} style={{padding:14,borderRadius:14,border:"none",background:"#D65A7C",color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer"}}>保存设置 ♡</button>
        <p style={{fontSize:11,color:"#bbb",textAlign:"center",margin:0}}>头像、名字、壁纸云端同步 ☁️ · CSS主题仅存本地</p>
      </div>
    </div>
  );

  let ld = "";
  return (
    <div className="chat-app" style={{height:"100dvh",display:"flex",flexDirection:"column",background:wall?`url(${wall}) center/cover no-repeat fixed`:"var(--c-page-body-bg,#f5f5f5)"}}>
      <style>{css}</style>
      <style>{`.chat-app{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}.nn-msg-row{display:flex!important;gap:8px;padding:4px 8px;align-items:flex-start;width:100%;box-sizing:border-box}.nn-msg-row[data-role="user"]{flex-direction:row-reverse;justify-content:flex-start}.nn-msg-row[data-role="assistant"]{flex-direction:row;justify-content:flex-start}.chat-msg-content-wrap{max-width:75%;min-width:0}.chat-msg-avatar{width:36px;height:36px;border-radius:18px;overflow:hidden;flex-shrink:0;position:relative}.chat-msg-avatar img{width:100%;height:100%;object-fit:cover}.chat-bubble-role-assistant,.chat-bubble-role-user{padding:10px 14px;border-radius:18px;word-break:break-word;position:relative;overflow:visible}.chat-bubble-role-assistant{background:var(--c-bubble-other,#f0f0f0);color:var(--c-text,#333)}.chat-bubble-role-user{background:var(--c-bubble-self,#dcf8c6);color:var(--c-text,#333)}.chat-markdown{position:relative;z-index:50}.chat-markdown-paragraph{line-height:1.5;font-size:15px;white-space:pre-wrap}.chat-scroll-anchored{-webkit-overflow-scrolling:touch}.nn-date{text-align:center;padding:12px 0 4px;font-size:12px;color:#999}.nn-time{font-size:11px;color:#aaa;margin-top:2px;padding:0 4px}.nn-msg-row[data-role="user"] .nn-time{text-align:right}`}</style>

      <div className="page-header" style={{...safeTop,paddingLeft:16,paddingRight:16,paddingBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--c-header-bg,rgba(245,245,245,0.9))",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(0,0,0,0.08)",flexShrink:0,zIndex:100}}>
        <div className="page-header-content" style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
          {noxAv(36)}
          <span className="page-title" style={{fontSize:17,fontWeight:600,color:"var(--c-text-title,#000)"}}>{name}</span>
        </div>
        <button onClick={()=>setPage("settings")} aria-label="设置" style={{background:"none",border:"none",fontSize:22,cursor:"pointer",padding:"4px 8px",color:"var(--c-text,#666)",lineHeight:1}}>⚙️</button>
      </div>

      {/* ★ 底部 padding 加大到 60px，兼容 CSS 主题的装饰元素延伸 */}
      <div ref={ref} className="page-body chat-room-main-pane chat-scroll-anchored" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2,padding:"8px 0 60px 0"}}>
        {msgs.map(m => {
          const dl = dateL(m.created_at), show = dl !== ld; if (show) ld = dl;
          const isNox = m.sender === "nox";
          return <div key={m.id}>
            {show && <div className="nn-date">{dl}</div>}
            <div className="nn-msg-row chat-msg-wrapper" data-role={isNox?"assistant":"user"}>
              <div className="chat-msg-avatar">{isNox ? noxAv(36) : ningAv(36)}</div>
              <div className="chat-msg-content-wrap" style={{display:"flex",flexDirection:"column"}}>
                <div className={isNox?"chat-bubble-role-assistant chat-bubble-role-mascot":"chat-bubble-role-user"} data-ui={isNox?"bubble-bot":"bubble-user"}>
                  <div><div className="chat-markdown"><div className="chat-markdown-paragraph">{m.content}</div></div></div>
                </div>
                <div className="nn-time">{time(m.created_at)}</div>
              </div>
            </div>
          </div>;
        })}
      </div>

      <div className="chat-input-bar" style={{padding:"8px 12px",display:"flex",gap:8,alignItems:"flex-end",background:"var(--c-header-bg,rgba(245,245,245,0.95))",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(0,0,0,0.08)",flexShrink:0,paddingBottom:"max(8px,env(safe-area-inset-bottom))"}}>
        <textarea className="chat-input-textarea" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder={`跟${name}聊聊...`} rows={1} style={{flex:1,padding:"10px 14px",borderRadius:20,border:"1px solid rgba(0,0,0,0.1)",fontSize:15,resize:"none",outline:"none",lineHeight:1.4,maxHeight:120,background:"var(--c-input,#f0f0f0)",color:"var(--c-text,#333)"}} />
        <button onClick={send} disabled={busy||!input.trim()} style={{width:42,height:42,borderRadius:21,border:"none",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",background:input.trim()?"#D65A7C":"#ddd",color:input.trim()?"#fff":"#999",cursor:input.trim()?"pointer":"default",flexShrink:0,transition:"all 0.2s"}}>↑</button>
      </div>
    </div>
  );
}
