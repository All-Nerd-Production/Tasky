import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

const EMOJIS = ['👤','🦊','🐺','🦁','🐯','🦅','🐉','🌙','⚡','🔥','🌿','💎']
const COLORS  = ['#7B5EA7','#5A8FC0','#52B788','#D4A853','#D47BB5','#E07070','#6BB8C4','#C09A4E']

export default function AuthPage() {
  const [mode,     setMode]     = useState('login')  // 'login' | 'register'
  const [form,     setForm]     = useState({ email:'', password:'', username:'', display_name:'', avatar_emoji:'👤', avatar_color:'#7B5EA7' })
  const [loading,  setLoading]  = useState(false)
  const { login, register }     = useAuthStore()

  function set(k, v) { setForm(f => ({...f, [k]: v})) }

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password })
        window.location.href = '/'
      } else {
        if (!form.username || !form.display_name) {
          toast.error('Preencha todos os campos'); setLoading(false); return
        }
        await register(form)
        window.location.href = '/'
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao autenticar')
    }
    setLoading(false)
  }

  return (
    <div className="auth-page">
      {/* Orbes de fundo */}
      <div style={{ position:'fixed', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {[['10%','8%','rgba(123,94,167,.07)'],[,'60%','rgba(82,183,136,.05)'],['30%','55%','rgba(90,143,192,.06)']].map((o,i)=>(
          <div key={i} style={{ position:'absolute', top:o[0], left:o[1], width:300, height:300, borderRadius:'50%', background:o[2], filter:'blur(60px)' }}/>
        ))}
      </div>

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div style={{ width:36,height:36,background:'linear-gradient(135deg,var(--accent),var(--accent-2))',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,boxShadow:'0 0 14px var(--accent-glow)' }}>📋</div>
          <span style={{ fontFamily:'var(--font-serif)',fontSize:20,fontWeight:600 }}>Tasky</span>
        </div>

        <h2 className="auth-title">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
        <p className="auth-sub">
          {mode === 'login'
            ? 'Gerencie seus projetos com seu time em tempo real.'
            : 'Junte-se ao Tasky e colabore com seu time.'}
        </p>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              {/* Avatar picker */}
              <div className="field">
                <div className="field-label">Avatar</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                  {EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => set('avatar_emoji', e)}
                      style={{ fontSize:18, padding:'4px 7px', borderRadius:6, border:`1px solid ${form.avatar_emoji===e?'var(--accent-border)':'var(--border)'}`, background:form.avatar_emoji===e?'var(--accent-glow)':'var(--bg-3)', cursor:'pointer' }}>
                      {e}
                    </button>
                  ))}
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => set('avatar_color', c)}
                      style={{ width:22,height:22,borderRadius:5,background:c,cursor:'pointer',border:`2px solid ${form.avatar_color===c?'#fff':'transparent'}`,transition:'transform var(--t)' }}
                      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.2)'}
                      onMouseLeave={e=>e.currentTarget.style.transform='none'}
                    />
                  ))}
                </div>
              </div>

              <div className="field-row field-row-2" style={{ marginBottom:12 }}>
                <div className="field">
                  <div className="field-label">Nome de exibição</div>
                  <input className="input" placeholder="João Silva" value={form.display_name} onChange={e=>set('display_name',e.target.value)} required/>
                </div>
                <div className="field">
                  <div className="field-label">Username</div>
                  <input className="input" placeholder="joao" value={form.username} onChange={e=>set('username',e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} required/>
                </div>
              </div>
            </>
          )}

          <div className="field">
            <div className="field-label">Email</div>
            <input className="input" type="email" placeholder="email@empresa.com" value={form.email} onChange={e=>set('email',e.target.value)} required autoFocus={mode==='login'}/>
          </div>

          <div className="field" style={{ marginBottom:20 }}>
            <div className="field-label">Senha</div>
            <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)} required minLength={6}/>
          </div>

          <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ height:40 }}>
            {loading ? <span className="spinner"/> : mode==='login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <hr className="auth-divider"/>
        <p className="auth-footer">
          {mode === 'login'
            ? <>Não tem conta? <span className="auth-link" onClick={()=>setMode('register')}>Criar conta</span></>
            : <>Já tem conta? <span className="auth-link" onClick={()=>setMode('login')}>Entrar</span></>
          }
        </p>
      </div>
    </div>
  )
}
