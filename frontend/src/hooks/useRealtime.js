import { useEffect, useRef, useState } from 'react'
import { wsUrl } from '../services/api'
import { useWorkspaceStore } from '../store/workspaceStore'

export function useRealtimeProject(projectId) {
  const wsRef        = useRef(null)
  const [online, setOnline]   = useState([])   // usuários online
  const applyWsEvent = useWorkspaceStore(s => s.applyWsEvent)

  useEffect(() => {
    if (!projectId) return

    const token = localStorage.getItem('tasky_token')
    if (!token) return

    function connect() {
      const url = wsUrl(projectId, token)
      const ws  = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] conectado ao projeto', projectId)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)

          if (msg.event === 'user_joined') {
            setOnline(prev => {
              const u = msg.data?.user
              if (!u || prev.find(x => x.id === u.id)) return prev
              return [...prev, u]
            })
          } else if (msg.event === 'user_left') {
            setOnline(prev => prev.filter(u => u.id !== msg.data?.user_id))
          } else {
            applyWsEvent(msg)
          }
        } catch {}
      }

      ws.onclose = (e) => {
        if (e.code !== 1000) {
          // Reconecta com backoff exponencial
          setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      wsRef.current?.close(1000)
      setOnline([])
    }
  }, [projectId])

  function send(msg) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }

  return { online, send }
}
