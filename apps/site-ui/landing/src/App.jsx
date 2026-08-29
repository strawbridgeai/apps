import { Header } from './components/Header.jsx';
import { Hero } from './components/Hero.jsx';
import { AppGrid } from './components/AppGrid.jsx';
import { Footer } from './components/Footer.jsx';
import { OrganicBackground, CircuitMesh } from './components/OrganicBackground.jsx';
import { WaveDivider } from './components/WaveDivider.jsx';
import { DesignerBridge } from './components/DesignerBridge.jsx';

export default function App() {
  // Only the Site Designer preview iframe ever loads with this param
  // (DesignerTab.jsx appends it) — the published site never does.
  const isDesignerPreview =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('designer') === '1';

  return (
    <div className="relative min-h-screen overflow-hidden">
      {isDesignerPreview && <DesignerBridge />}
      <CircuitMesh />
      <div className="relative">
        <OrganicBackground />
        <Header />
        <main>
          <Hero />
          <WaveDivider />
          <AppGrid />
        </main>
        <Footer />
      </div>
    </div>
  );
}
