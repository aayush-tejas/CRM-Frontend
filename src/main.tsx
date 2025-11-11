import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Auth from './auth/Auth'
import { getSession, clearSession, ensureDemoUser } from './auth/session'
import './styles.css'

function Root() {
  React.useEffect(() => {
    // Seed a demo account if it doesn't exist yet
    ensureDemoUser()
  }, [])
  const [authed, setAuthed] = React.useState(!!getSession())
  return (
    <React.StrictMode>
      {authed ? (
        <App />
      ) : (
        <Auth onAuthed={() => setAuthed(true)} />
      )}
    </React.StrictMode>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />)
