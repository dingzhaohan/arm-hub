import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Papers from './pages/Papers'
import PaperDetail from './pages/PaperDetail'
import Arms from './pages/Arms'
import ArmDetail from './pages/ArmDetail'
import ArmVersionDetail from './pages/ArmVersionDetail'
import ArmUploadWizard from './pages/ArmUploadWizard'
import Datasets from './pages/Datasets'
import DatasetDetail from './pages/DatasetDetail'
import Skills from './pages/Skills'
import SkillDetail from './pages/SkillDetail'
import Profile from './pages/Profile'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/papers" element={<Papers />} />
        <Route path="/papers/:id" element={<PaperDetail />} />
        <Route path="/arms" element={<Arms />} />
        <Route path="/arms/new" element={<ArmUploadWizard />} />
        <Route path="/arms/:id" element={<ArmDetail />} />
        <Route path="/arm-versions/:id" element={<ArmVersionDetail />} />
        <Route path="/datasets" element={<Datasets />} />
        <Route path="/datasets/:id" element={<DatasetDetail />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/skills/:id" element={<SkillDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
