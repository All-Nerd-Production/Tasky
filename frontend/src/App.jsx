import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import AuthPage from './pages/AuthPage'
import MainPage from './pages/MainPage'
import * as api from './services/api'

function JoinPage({ token }) {
  useEffect(() => {
    api.joinByInvite(token)
      .then(r => { alert(`Você entrou no workspace: ${r.workspace}`); window.location.href = '/' })
      .catch(() => { alert('Convite inválido ou expirado'); window.location.href = '/' })
  }, [])
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-3)', fontSize:14 }}>
      Processando convite...
    </div>
  )
}

export default function App() {
  const { user, token, refreshMe } = useAuthStore()

  useEffect(() => { if (token) refreshMe() }, [])

  const path = window.location.pathname

  const TOAST_OPTS = {
    style: { background:'var(--bg-3)', color:'var(--text)', border:'1px solid var(--border)', fontFamily:'var(--font)', fontSize:'13px' }
  }

  if (path.startsWith('/join/')) {
    return (
      <>
        <Toaster position="bottom-right" toastOptions={TOAST_OPTS}/>
        <JoinPage token={path.replace('/join/','')}/>
      </>
    )
  }

  if (!token || !user) {
    return (
      <>
        <Toaster position="bottom-right" toastOptions={TOAST_OPTS}/>
        <AuthPage/>
      </>
    )
  }

  return (
    <>
      <Toaster position="bottom-right" toastOptions={TOAST_OPTS}/>
      <MainPage/>
    </>
  )
}
