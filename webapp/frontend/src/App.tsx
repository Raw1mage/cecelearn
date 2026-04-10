import { Route, Routes } from 'react-router-dom'
import { A1Page } from './features/a1/A1Page'
import { A2Page } from './features/a2/A2Page'
import { A3Page } from './features/a3/A3Page'
import { AppLayout } from './shared/components/AppLayout'
import { PortalPage } from './routes/PortalPage'

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<PortalPage />} />
        <Route path="/a1" element={<A1Page />} />
        <Route path="/a2" element={<A2Page />} />
        <Route path="/a3" element={<A3Page />} />
      </Routes>
    </AppLayout>
  )
}
