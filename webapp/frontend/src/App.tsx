import { Route, Routes } from 'react-router-dom'
import { A1Page } from './features/a1/A1Page'
import { A2Page } from './features/a2/A2Page'
import { A3Page } from './features/a3/A3Page'
import { A5Page } from './features/a5/A5Page'
import { A7Page } from './features/a7/A7Page'
import { AdminPage } from './features/admin/AdminPage'
import { AppLayout } from './shared/components/AppLayout'
import { ScoreProvider } from './shared/ScoreContext'

export default function App() {
  return (
    <ScoreProvider>
    <AppLayout>
      <Routes>
        <Route path="/" element={<A1Page />} />
        <Route path="/a1" element={<A1Page />} />
        <Route path="/a2" element={<A2Page />} />
        <Route path="/a3" element={<A3Page />} />
        <Route path="/a5" element={<A5Page />} />
        <Route path="/a7" element={<A7Page />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </AppLayout>
    </ScoreProvider>
  )
}
