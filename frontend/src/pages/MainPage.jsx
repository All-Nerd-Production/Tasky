import { useEffect, useState, useRef } from 'react'
import { Plus, X, Settings, Users, BarChart2, LogOut, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useAuthStore } from '../store/authStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useRealtimeProject } from '../hooks/useRealtime'
import * as api from '../services/api'

// ── Constantes ─────────────────────────────────────────────────────────────
const STATUSES = [
  { id:'backlog',     label:'Backlog',       color:'#524F6B', emoji:'⬜' },
  { id:'selected',    label:'Selecionado',   color:'#5A8FC0', emoji:'🔵' },
  { id:'in_progress', label:'Em andamento',  color:'#D4A853', emoji:'🟡' },
  { id:'in_review',   label:'Em revisão',    color:'#C09A4E', emoji:'🔶' },
  { id:'in_qa',       label:'Em QA',         color:'#D47BB5', emoji:'🟠' },
  { id:'done',        label:'Concluído',     color:'#52B788', emoji:'✅' },
]

const PRIORITIES = {
  low:      { label:'Baixa',   color:'#52B788', symbol:'↓' },
  medium:   { label:'Média',   color:'#D4A853', symbol:'→' },
  high:     { label:'Alta',    color:'#E07070', symbol:'↑' },
  critical: { label:'Crítica', color:'#C05A6A', symbol:'⚡' },
}

const TYPES = {
  initiative:{ label:'Iniciativa', icon:'🎯' },
  epic:      { label:'Épico',      icon:'🏔️' },
  story:     { label:'História',   icon:'📖' },
  task:      { label:'Tarefa',     icon:'✅' },
  bug:       { label:'Bug',        icon:'🐛' },
  subtask:   { label:'Sub-tarefa', icon:'🔩' },
}

// ── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ user, size = 28, showName = false }) {
  if (!user) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div className="avatar" style={{ width:size, height:size, background:user.avatar_color+'33', border:`1.5px solid ${user.avatar_color}55`, fontSize:size*0.5 }}>
        {user.avatar_emoji}
      </div>
      {showName && <span style={{ fontSize:12, color:'var(--text-2)' }}>{user.display_name}</span>}
    </div>
  )
}

// ── Kanban Card ─────────────────────────────────────────────────────────────
function KCard({ item, onClick }) {
  const p = PRIORITIES[item.priority] || PRIORITIES.medium
  const t = TYPES[item.item_type]     || TYPES.task
  return (
    <div className="kcard" onClick={() => onClick(item)}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:6 }}>
        <span style={{ fontSize:12, flexShrink:0 }}>{t.icon}</span>
        <span className="kcard-title">{item.title}</span>
      </div>
      <div className="kcard-meta">
        <span className="kcard-key">{item.key}</span>
        {item.story_points && <span className="kcard-pts">{item.story_points}sp</span>}
        <span className="priority-dot" style={{ background:p.color }} title={p.label}/>
        {item.assignee && <Avatar user={item.assignee} size={20}/>}
        {(item.notedex_note_ids||[]).length > 0 && (
          <span className="kcard-notes">🔗{item.notedex_note_ids.length}</span>
        )}
        {(item.tags||[]).slice(0,2).map(t=>(
          <span key={t} className="tag-chip" style={{fontSize:9}}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// ── Item Modal (criar / editar) ─────────────────────────────────────────────
function ItemModal({ item, projectId, members, onSave, onClose }) {
  const isNew = !item
  const [form, setForm] = useState(item ? { ...item, tags: item.tags||[], notedex_note_ids: item.notedex_note_ids||[] } : {
    title:'', description:'', item_type:'task', status:'backlog',
    priority:'medium', story_points:'', assignee_id:'', tags:[], notedex_note_ids:[],
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({...f, [k]: v})) }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Título obrigatório'); return }
    setSaving(true)
    try {
      await onSave({ ...form, story_points: form.story_points ? +form.story_points : null })
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao salvar')
    }
    setSaving(false)
  }

  function addTag(e) {
    if ((e.key==='Enter'||e.key===',') && tagInput.trim()) {
      e.preventDefault()
      const t = tagInput.trim().toLowerCase()
      if (!form.tags.includes(t)) set('tags', [...form.tags, t])
      setTagInput('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width:580 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontSize:18 }}>{TYPES[form.item_type]?.icon||'✅'}</span>
          <span className="modal-title">{isNew ? 'Novo item' : form.key}</span>
          <button className="btn btn-icon" onClick={onClose}><X size={14}/></button>
        </div>

        <div className="modal-body">
          {/* Title */}
          <div className="field">
            <div className="field-label">Título *</div>
            <input className="input" placeholder="Título do item..." value={form.title} onChange={e=>set('title',e.target.value)} autoFocus/>
          </div>

          {/* Type / Status / Priority */}
          <div className="field-row field-row-3">
            {[
              ['Tipo','item_type', Object.entries(TYPES).map(([v,m])=>({v,l:`${m.icon} ${m.label}`}))],
              ['Status','status', STATUSES.map(s=>({v:s.id,l:`${s.emoji} ${s.label}`}))],
              ['Prioridade','priority', Object.entries(PRIORITIES).map(([v,m])=>({v,l:`${m.symbol} ${m.label}`}))],
            ].map(([label,key,opts])=>(
              <div className="field" key={key}>
                <div className="field-label">{label}</div>
                <select className="select" value={form[key]} onChange={e=>set(key,e.target.value)}>
                  {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Points + Assignee */}
          <div className="field-row field-row-2">
            <div className="field">
              <div className="field-label">Story Points</div>
              <input className="input" type="number" min="0" placeholder="0" value={form.story_points||''} onChange={e=>set('story_points',e.target.value)}/>
            </div>
            <div className="field">
              <div className="field-label">Responsável</div>
              <select className="select" value={form.assignee_id||''} onChange={e=>set('assignee_id',e.target.value||null)}>
                <option value="">— Ninguém —</option>
                {members.map(m=>(
                  <option key={m.id} value={m.id}>{m.avatar_emoji} {m.display_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="field">
            <div className="field-label">Descrição (Markdown)</div>
            <textarea className="input" rows={4} style={{ resize:'vertical', fontFamily:'var(--font-mono)', fontSize:12 }}
              placeholder="Descreva o item..." value={form.description||''} onChange={e=>set('description',e.target.value)}/>
          </div>

          {/* Tags */}
          <div className="field">
            <div className="field-label">Tags</div>
            <div className="input" style={{ display:'flex', flexWrap:'wrap', gap:4, minHeight:36 }}>
              {form.tags.map(t=>(
                <span key={t} className="tag-chip" style={{ cursor:'pointer' }} onClick={()=>set('tags',form.tags.filter(x=>x!==t))}>
                  #{t} ×
                </span>
              ))}
              <input style={{ background:'none', border:'none', outline:'none', color:'var(--text-2)', fontSize:11, fontFamily:'var(--font-mono)', flex:1, minWidth:80 }}
                placeholder="+ tag (Enter)" value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={addTag}/>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner"/> : isNew ? '+ Criar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({ item, members, onUpdate, onClose }) {
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])
  const [tab,      setTab]      = useState('details')
  const [comment,  setComment]  = useState('')
  const [sending,  setSending]  = useState(false)

  useEffect(() => {
    if (!item) return
    api.getComments(item.id).then(setComments).catch(()=>{})
    api.getActivity(item.id).then(setActivity).catch(()=>{})
  }, [item?.id])

  if (!item) return null

  const p = PRIORITIES[item.priority] || PRIORITIES.medium
  const s = STATUSES.find(x=>x.id===item.status) || STATUSES[0]

  async function changeStatus(newStatus) {
    await onUpdate(item.id, { status: newStatus })
    toast.success('Status atualizado')
  }

  async function sendComment() {
    if (!comment.trim()) return
    setSending(true)
    try {
      const c = await api.addComment(item.id, { content: comment })
      setComments(prev => [...prev, c])
      setComment('')
    } catch { toast.error('Erro ao comentar') }
    setSending(false)
  }

  function fmtTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div className="detail-panel">
      {/* Header */}
      <div className="detail-header">
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <span style={{ fontSize:16 }}>{TYPES[item.item_type]?.icon||'✅'}</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-3)' }}>{item.key}</span>
          <button className="btn btn-icon" style={{ marginLeft:'auto' }} onClick={onClose}><X size={13}/></button>
        </div>
        <h3 style={{ fontFamily:'var(--font-serif)', fontSize:16, fontWeight:600, color:'var(--text)', lineHeight:1.4, marginBottom:10 }}>{item.title}</h3>

        {/* Status row */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <select className="select" style={{ width:'auto', fontSize:11 }} value={item.status} onChange={e=>changeStatus(e.target.value)}>
            {STATUSES.map(st=>(
              <option key={st.id} value={st.id}>{st.emoji} {st.label}</option>
            ))}
          </select>
          <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:p.color, fontFamily:'var(--font-mono)' }}>
            {p.symbol} {p.label}
          </span>
          {item.story_points && (
            <span className="kcard-pts">{item.story_points}sp</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {['details','comments','activity'].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ flex:1, padding:'9px 0', border:'none', background:'none', color:tab===t?'var(--accent-2)':'var(--text-3)', fontSize:11, fontFamily:'var(--font-mono)', cursor:'pointer', borderBottom:`2px solid ${tab===t?'var(--accent-2)':'transparent'}`, transition:'all var(--t)' }}>
            {t==='details'?'Detalhes':t==='comments'?`Comentários (${comments.length})`:'Atividade'}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {tab === 'details' && (
          <>
            {/* Assignee */}
            <div className="detail-section">
              <div className="detail-section-title">Responsável</div>
              {item.assignee
                ? <Avatar user={item.assignee} showName/>
                : <span style={{ fontSize:12, color:'var(--text-3)' }}>Não atribuído</span>
              }
            </div>

            {/* Tags */}
            {item.tags?.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-title">Tags</div>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {item.tags.map(t=><span key={t} className="tag-chip">#{t}</span>)}
                </div>
              </div>
            )}

            {/* Description */}
            {item.description && (
              <div className="detail-section">
                <div className="detail-section-title">Descrição</div>
                <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.8 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.description}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* NoteDex links */}
            {item.notedex_note_ids?.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-title">Notas NoteDex vinculadas</div>
                {item.notedex_note_ids.map(id=>(
                  <div key={id} style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--accent-2)', padding:'3px 0' }}>
                    🔗 {id.slice(0,8)}...
                  </div>
                ))}
              </div>
            )}

            {/* Datas */}
            <div className="detail-section">
              <div className="detail-section-title">Datas</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, fontSize:11, fontFamily:'var(--font-mono)', color:'var(--text-3)' }}>
                <span>Criado: {fmtTime(item.created_at)}</span>
                {item.due_date && <span style={{ color:new Date(item.due_date)<new Date()?'var(--red)':'var(--text-2)' }}>Prazo: {fmtTime(item.due_date)}</span>}
                {item.completed_at && <span style={{ color:'var(--green)' }}>Concluído: {fmtTime(item.completed_at)}</span>}
              </div>
            </div>
          </>
        )}

        {tab === 'comments' && (
          <>
            {comments.map(c=>(
              <div className="comment" key={c.id}>
                <div className="comment-avatar" style={{ background:c.author?.avatar_color+'33' }}>
                  {c.author?.avatar_emoji||'👤'}
                </div>
                <div className="comment-body">
                  <div className="comment-author">{c.author?.display_name||'Usuário'}</div>
                  <div className="comment-text">{c.content}</div>
                  <div className="comment-time">{fmtTime(c.created_at)}</div>
                </div>
              </div>
            ))}
            {comments.length===0 && (
              <div style={{ textAlign:'center', padding:'20px 0', fontSize:12, color:'var(--text-3)' }}>
                Nenhum comentário ainda
              </div>
            )}
            {/* Input de comentário */}
            <div style={{ marginTop:12, display:'flex', gap:8 }}>
              <textarea className="input" rows={2} style={{ flex:1, resize:'none', fontSize:12 }}
                placeholder="Adicionar comentário..." value={comment} onChange={e=>setComment(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&e.ctrlKey) sendComment() }}/>
              <button className="btn btn-primary" onClick={sendComment} disabled={!comment.trim()||sending}>
                {sending ? <span className="spinner"/> : '↑'}
              </button>
            </div>
            <div style={{ fontSize:10, color:'var(--text-4)', marginTop:4, fontFamily:'var(--font-mono)' }}>
              Ctrl+Enter para enviar
            </div>
          </>
        )}

        {tab === 'activity' && (
          <>
            {activity.map(a=>(
              <div className="activity-item" key={a.id}>
                <div className="activity-dot"/>
                <div>
                  <span style={{ color:'var(--text-2)' }}>{a.user?.display_name||'Sistema'}</span>
                  {' '}{a.action}
                  {a.field && <> · <span style={{ color:'var(--accent-2)' }}>{a.field}</span></>}
                  {a.new_value && <> → <span style={{ color:'var(--text)' }}>{a.new_value}</span></>}
                  <div style={{ fontSize:10, color:'var(--text-4)', marginTop:2, fontFamily:'var(--font-mono)' }}>
                    {fmtTime(a.created_at)}
                  </div>
                </div>
              </div>
            ))}
            {activity.length===0 && (
              <div style={{ textAlign:'center', padding:'20px 0', fontSize:12, color:'var(--text-3)' }}>
                Sem atividade registrada
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MainPage() {
  const { user, logout } = useAuthStore()
  const {
    workspaces, activeWorkspace, projects, activeProject,
    members, items, stats,
    fetchWorkspaces, selectWorkspace, selectProject,
    createProject, createItem, updateItem,
  } = useWorkspaceStore()

  const [view,        setView]        = useState('kanban')
  const [showNewProj, setShowNewProj] = useState(false)
  const [showNewItem, setShowNewItem] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showInvite,  setShowInvite]  = useState(false)
  const [showWsMenu,  setShowWsMenu]  = useState(false)
  const [detailItem,  setDetailItem]  = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteResult,setInviteResult]= useState(null)

  // WebSocket tempo real
  const { online } = useRealtimeProject(activeProject?.id)

  useEffect(() => { fetchWorkspaces() }, [])

  async function handleCreateProject(data) {
    try { await createProject(data); toast.success('Projeto criado!'); setShowNewProj(false) }
    catch(e) { toast.error(e.response?.data?.detail||'Erro') }
  }

  async function handleCreateItem(data) {
    try { await createItem(data); toast.success('Item criado!') }
    catch(e) { toast.error(e.response?.data?.detail||'Erro') }
  }

  async function handleUpdateItem(id, data) {
    try { await updateItem(id, data) }
    catch(e) { toast.error('Erro ao atualizar') }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !activeWorkspace) return
    try {
      const r = await api.inviteMember(activeWorkspace.id, { email: inviteEmail })
      setInviteResult(r)
      toast.success(r.added ? 'Membro adicionado!' : 'Convite gerado!')
      setInviteEmail('')
    } catch(e) { toast.error(e.response?.data?.detail||'Erro') }
  }

  // Modais de novo projeto / invite
  const NewProjModal = () => (
    <div className="modal-overlay" onClick={()=>setShowNewProj(false)}>
      <div className="modal" style={{ width:420 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Novo Projeto</span>
          <button className="btn btn-icon" onClick={()=>setShowNewProj(false)}><X size={14}/></button>
        </div>
        <NewProjForm onSave={handleCreateProject} onClose={()=>setShowNewProj(false)}/>
      </div>
    </div>
  )

  if (!activeWorkspace && workspaces.length === 0) {
    return (
      <div className="empty" style={{ height:'100vh' }}>
        <div className="empty-icon">📋</div>
        <h3 className="empty-title">Bem-vindo ao Tasky, {user?.display_name}!</h3>
        <p className="empty-sub">Crie seu primeiro workspace para começar a gerenciar projetos.</p>
        <CreateWsForm onSave={ws => selectWorkspace(ws)}/>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* Modais */}
      {showNewProj  && <NewProjModal/>}
      {showNewItem  && <ItemModal projectId={activeProject?.id} members={members} onSave={handleCreateItem} onClose={()=>setShowNewItem(false)}/>}
      {showMembers  && <MembersModal ws={activeWorkspace} members={members} onClose={()=>setShowMembers(false)} onInvite={()=>{ setShowMembers(false); setShowInvite(true) }}/>}
      {showInvite   && (
        <div className="modal-overlay" onClick={()=>setShowInvite(false)}>
          <div className="modal" style={{ width:400 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Convidar membro</span>
              <button className="btn btn-icon" onClick={()=>setShowInvite(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="field">
                <div className="field-label">Email do convidado</div>
                <input className="input" type="email" placeholder="colega@empresa.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleInvite()} autoFocus/>
              </div>
              {inviteResult && (
                <div style={{ padding:'10px 12px', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', fontSize:12, color:'var(--text-2)', marginTop:8 }}>
                  {inviteResult.added
                    ? `✅ ${inviteResult.user} adicionado ao workspace`
                    : <>🔗 Token de convite: <code style={{ fontFamily:'var(--font-mono)', color:'var(--accent-2)', fontSize:11 }}>{inviteResult.invite_token}</code><br/><span style={{ color:'var(--text-3)', fontSize:11 }}>Envie este token para o colega acessar /join/TOKEN</span></>
                  }
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setShowInvite(false)}>Fechar</button>
              <button className="btn btn-primary" onClick={handleInvite} disabled={!inviteEmail.trim()}>Convidar</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">📋</div>
          <span className="logo-text">Tasky</span>
        </div>

        {/* Workspace selector */}
        <div className="ws-selector">
          <button className="ws-btn" onClick={()=>setShowWsMenu(v=>!v)}>
            <span style={{ fontSize:16 }}>{activeWorkspace?.icon||'🏢'}</span>
            <span style={{ flex:1, textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeWorkspace?.name||'Workspace'}</span>
            <ChevronDown size={12}/>
          </button>
          {showWsMenu && (
            <div style={{ position:'absolute', zIndex:200, background:'var(--bg-3)', border:'1px solid var(--border-2)', borderRadius:'var(--r)', padding:'6px', marginTop:4, width:220, boxShadow:'0 8px 24px rgba(0,0,0,.5)', animation:'fadeDown 150ms ease' }}>
              <style>{`@keyframes fadeDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
              {workspaces.map(ws=>(
                <div key={ws.id} onClick={()=>{ selectWorkspace(ws); setShowWsMenu(false) }}
                  style={{ padding:'8px 10px', borderRadius:'var(--r-sm)', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:8, transition:'background var(--t)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-4)'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}
                >
                  {ws.icon} {ws.name}
                  {ws.id===activeWorkspace?.id && <span style={{ marginLeft:'auto', color:'var(--accent-2)', fontSize:11 }}>✓</span>}
                </div>
              ))}
              <hr style={{ border:'none', borderTop:'1px solid var(--border)', margin:'4px 0' }}/>
              <div onClick={()=>{ setShowMembers(true); setShowWsMenu(false) }}
                style={{ padding:'8px 10px', borderRadius:'var(--r-sm)', cursor:'pointer', fontSize:12, color:'var(--text-3)', display:'flex', gap:8, transition:'background var(--t)' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg-4)'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}
              >
                <Users size={12}/> Membros
              </div>
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="sidebar-section">Projetos</div>
        <div className="proj-list">
          {projects.map(p=>(
            <div key={p.id} className={`proj-item ${activeProject?.id===p.id?'active':''}`} onClick={()=>selectProject(p)}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontSize:14 }}>{p.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="proj-name">{p.name}</div>
                  <div className="proj-meta">{p.key} · {p.item_count} itens</div>
                </div>
              </div>
              {p.item_count > 0 && (
                <div className="proj-progress">
                  <div className="proj-progress-bar" style={{ width:`${Math.round(p.done_count/p.item_count*100)}%`, background:p.color }}/>
                </div>
              )}
            </div>
          ))}
          {projects.length===0 && (
            <div style={{ padding:'12px 8px', fontSize:11, color:'var(--text-4)', textAlign:'center' }}>
              Nenhum projeto
            </div>
          )}
        </div>

        {/* Footer sidebar */}
        <div style={{ padding:'10px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
          <button className="btn btn-primary btn-full" onClick={()=>setShowNewProj(true)}>
            <Plus size={13}/> Novo projeto
          </button>
          <div style={{ display:'flex', gap:4 }}>
            <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center', fontSize:11 }} onClick={()=>setShowInvite(true)}>
              <Users size={11}/> Convidar
            </button>
            <button className="btn btn-icon" onClick={logout} title="Sair"><LogOut size={13}/></button>
          </div>
          {/* User */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 4px' }}>
            <Avatar user={user} size={24}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:500, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.display_name}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      {activeProject ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Topbar */}
          <div className="topbar">
            <div>
              <div className="topbar-title">{activeProject.icon} {activeProject.name}</div>
              <div className="topbar-sub">{activeProject.key} · {items.length} itens · {items.filter(i=>i.status==='done').length} concluídos</div>
            </div>

            {/* Online users */}
            {online.length > 0 && (
              <div className="online-users" style={{ marginLeft:8 }}>
                {online.slice(0,5).map(u=>(
                  <div key={u.id} className="avatar" style={{ width:28, height:28, background:u.avatar_color+'33', border:`1.5px solid ${u.avatar_color}88`, fontSize:14 }} title={u.display_name}>
                    {u.avatar_emoji}
                  </div>
                ))}
                {online.length>5 && <span style={{ fontSize:10, color:'var(--text-3)', marginLeft:4 }}>+{online.length-5}</span>}
              </div>
            )}

            <div style={{ flex:1 }}/>

            {stats && (
              <div style={{ display:'flex', gap:12, fontSize:11, fontFamily:'var(--font-mono)', color:'var(--text-3)' }}>
                {[['🐛',stats.open_bugs,'bugs'],['🔥',stats.by_status?.in_progress||0,'em andamento']].map(([e,v,l])=>(
                  <span key={l}>{e} <span style={{ color:'var(--text-2)' }}>{v}</span> {l}</span>
                ))}
              </div>
            )}

            <div className="mode-toggle">
              {['kanban','list'].map(v=>(
                <button key={v} className={`mode-btn ${view===v?'active':''}`} onClick={()=>setView(v)}>
                  {v==='kanban'?'Kanban':'Lista'}
                </button>
              ))}
            </div>

            <button className="btn btn-primary" style={{ padding:'6px 12px', fontSize:11 }} onClick={()=>setShowNewItem(true)}>
              <Plus size={12}/> Novo item
            </button>
          </div>

          {/* Content area */}
          <div style={{ flex:1, overflow:'hidden', display:'flex' }}>
            <div style={{ flex:1, overflow:'auto', padding:16 }}>
              {view==='kanban' ? (
                <div className="kanban">
                  {STATUSES.map(st=>{
                    const col = items.filter(i=>i.status===st.id)
                    return (
                      <div key={st.id} className="kanban-col">
                        <div className="kanban-col-header">
                          <span style={{ fontSize:12 }}>{st.emoji}</span>
                          <span className="kanban-col-title" style={{ color:st.color }}>{st.label}</span>
                          <span className="kanban-col-count">{col.length}</span>
                        </div>
                        <div className="kanban-col-body">
                          {col.map(item=>(
                            <KCard key={item.id} item={item} onClick={setDetailItem}/>
                          ))}
                          {col.length===0 && (
                            <div style={{ fontSize:11, color:'var(--text-4)', textAlign:'center', padding:'16px 0' }}>Vazio</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ maxWidth:900, display:'flex', flexDirection:'column', gap:4 }}>
                  {items.map(item=>(
                    <div key={item.id} onClick={()=>setDetailItem(item)}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r)', cursor:'pointer', transition:'all var(--t)', animation:'fadeUp 150ms ease' }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-2)'}
                      onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
                    >
                      <span>{TYPES[item.item_type]?.icon||'✅'}</span>
                      <span style={{ flex:1, fontSize:13, color:'var(--text)' }}>{item.title}</span>
                      <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-3)' }}>{item.key}</span>
                      <span style={{ fontSize:11, color:STATUSES.find(s=>s.id===item.status)?.color }}>
                        {STATUSES.find(s=>s.id===item.status)?.emoji} {STATUSES.find(s=>s.id===item.status)?.label}
                      </span>
                      {item.assignee && <Avatar user={item.assignee} size={22}/>}
                    </div>
                  ))}
                  {items.length===0 && (
                    <div className="empty"><div className="empty-icon">📋</div><h3 className="empty-title">Nenhum item</h3><p className="empty-sub">Crie o primeiro item do projeto.</p></div>
                  )}
                </div>
              )}
            </div>

            {/* Detail panel */}
            {detailItem && (
              <DetailPanel
                item={items.find(i=>i.id===detailItem.id)||detailItem}
                members={members}
                onUpdate={handleUpdateItem}
                onClose={()=>setDetailItem(null)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="empty" style={{ flex:1 }}>
          <div className="empty-icon">📋</div>
          <h3 className="empty-title">Selecione ou crie um projeto</h3>
          <p className="empty-sub">Escolha um projeto na sidebar para começar.</p>
          <button className="btn btn-primary" onClick={()=>setShowNewProj(true)}><Plus size={13}/> Criar projeto</button>
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes auxiliares ───────────────────────────────────────────────

function NewProjForm({ onSave, onClose }) {
  const ICONS   = ['📋','🚀','🎯','💡','🔥','🌿','💎','🛡️','⚙️','🎨','📊','🧪']
  const COLORS  = ['#7B5EA7','#5A8FC0','#52B788','#D4A853','#D47BB5','#E07070','#6BB8C4','#C09A4E']
  const [form, setForm] = useState({ name:'', key:'', description:'', color:'#7B5EA7', icon:'📋' })
  const [saving, setSaving] = useState(false)
  function set(k,v){ setForm(f=>({...f,[k]:v})) }

  async function handleSave() {
    if (!form.name||!form.key){ toast.error('Nome e chave obrigatórios'); return }
    setSaving(true)
    try { await onSave(form) } catch(e){ toast.error(e.response?.data?.detail||'Erro'); setSaving(false) }
    setSaving(false)
  }

  return (
    <>
      <div className="modal-body">
        <div className="field">
          <div className="field-label">Ícone</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {ICONS.map(ic=>(
              <button key={ic} type="button" onClick={()=>set('icon',ic)}
                style={{ fontSize:18, padding:'4px 8px', borderRadius:6, border:`1px solid ${form.icon===ic?'var(--accent-border)':'var(--border)'}`, background:form.icon===ic?'var(--accent-glow)':'var(--bg-3)', cursor:'pointer' }}>
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="field-label">Cor</div>
          <div style={{ display:'flex', gap:5 }}>
            {COLORS.map(c=>(
              <div key={c} onClick={()=>set('color',c)}
                style={{ width:24, height:24, borderRadius:6, background:c, cursor:'pointer', border:`2px solid ${form.color===c?'#fff':'transparent'}`, transition:'transform var(--t)' }}
                onMouseEnter={e=>e.currentTarget.style.transform='scale(1.2)'}
                onMouseLeave={e=>e.currentTarget.style.transform='none'}/>
            ))}
          </div>
        </div>
        <div className="field-row field-row-2">
          <div className="field">
            <div className="field-label">Nome *</div>
            <input className="input" placeholder="Meu Projeto" value={form.name} onChange={e=>set('name',e.target.value)} autoFocus/>
          </div>
          <div className="field">
            <div className="field-label">Chave *</div>
            <input className="input" placeholder="PROJ" value={form.key}
              onChange={e=>set('key',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10))}/>
          </div>
        </div>
        <div className="field">
          <div className="field-label">Descrição</div>
          <textarea className="input" rows={2} placeholder="Opcional..." value={form.description} onChange={e=>set('description',e.target.value)}/>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving?<span className="spinner"/>:'Criar projeto'}
        </button>
      </div>
    </>
  )
}

function MembersModal({ ws, members, onClose, onInvite }) {
  const ROLE_COLORS = { owner:'var(--accent-2)', admin:'var(--amber)', member:'var(--text-2)', viewer:'var(--text-3)' }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width:420 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <Users size={16}/>
          <span className="modal-title">Membros · {ws?.name}</span>
          <button className="btn btn-icon" onClick={onClose}><X size={14}/></button>
        </div>
        <div className="modal-body">
          {members.map(m=>(
            <div key={m.id} className="member-row">
              <Avatar user={m} size={32}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{m.display_name}</div>
                <div style={{ fontSize:11, color:'var(--text-3)' }}>@{m.username} · {m.email}</div>
              </div>
              <span className="role-badge" style={{ color:ROLE_COLORS[m.role]||'var(--text-3)', borderColor:ROLE_COLORS[m.role]+'40'||'var(--border)' }}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" onClick={onInvite}><Plus size={12}/> Convidar</button>
        </div>
      </div>
    </div>
  )
}

function CreateWsForm({ onSave }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const { createWorkspace } = useWorkspaceStore()

  async function handleSave() {
    if (!name||!slug){ toast.error('Preencha os campos'); return }
    setSaving(true)
    try { const ws = await createWorkspace({ name, slug, icon:'🏢', color:'#7B5EA7' }); onSave(ws) }
    catch(e){ toast.error(e.response?.data?.detail||'Erro') }
    setSaving(false)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, width:320, marginTop:16 }}>
      <input className="input" placeholder="Nome do workspace" value={name} onChange={e=>{ setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-')) }} autoFocus/>
      <input className="input" placeholder="Slug (ex: minha-empresa)" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}/>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving?<span className="spinner"/>:'Criar workspace'}
      </button>
    </div>
  )
}
