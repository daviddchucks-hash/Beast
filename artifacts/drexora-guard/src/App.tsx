import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowDownToLine, ArrowRight, Check, Clock3, Cpu, Download, HardDrive, LockKeyhole, Menu, MonitorCheck, ShieldCheck, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import mark from '@/assets/drexora-mark.png';
import './index.css';

const queryClient = new QueryClient();

function Brand() {
  return <Link href="/" className="brand" aria-label="Drexora Guard home"><img src={mark} className="brand-mark" alt="" />Drexora Guard</Link>;
}

function Header({ active }: { active: 'home' | 'download' }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <div className="topbar"><strong>Windows desktop security</strong> &nbsp;•&nbsp; Built to watch quietly</div>
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
          <nav className="nav-links" aria-label="Primary navigation">
            <Link href="/" className={`nav-link ${active === 'home' ? 'active' : ''}`}>Home</Link>
            <Link href="/#features" className="nav-link">Features</Link>
            <Link href="/#requirements" className="nav-link">Requirements</Link>
            <Link href="/download" className={`nav-link ${active === 'download' ? 'active' : ''}`}>Download</Link>
          </nav>
          <Link href="/download" className="button nav-cta">Get Drexora <ArrowRight size={15} /></Link>
          <button className="mobile-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
        {open && <nav className="mobile-panel container" aria-label="Mobile navigation">
          <Link href="/" onClick={close}>Home</Link>
          <Link href="/#features" onClick={close}>Features</Link>
          <Link href="/#requirements" onClick={close}>Requirements</Link>
          <Link href="/download" onClick={close}>Download for Windows <ArrowRight size={15} /></Link>
        </nav>}
      </header>
    </>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return <footer className="footer">
    <div className="container footer-grid">
      <div><Brand /><p className="footer-copy">Security software for your desktop. A calm, practical layer of visibility for your Windows PC.</p></div>
      <div className="footer-col"><h4>Explore</h4><Link href="/">Home</Link><Link href="/#features">Features</Link><Link href="/#requirements">Requirements</Link><Link href="/download">Download</Link></div>
      <div className="footer-col"><h4>Contact</h4><a href="mailto:drexxora@yahoo.com">drexxora@yahoo.com</a><a href="https://wa.me/2349036895700" target="_blank" rel="noreferrer">+234 903 689 5700</a><a href="https://drexora.name.ng" target="_blank" rel="noreferrer">drexora.name.ng</a></div>
    </div>
    <div className="container footer-bottom"><span>© {year} Drexora Guard. All rights reserved.</span><span>Proudly made by Drexora</span></div>
  </footer>;
}

function FeatureIcon({ type }: { type: 'shield' | 'lock' | 'bolt' | 'clock' }) {
  const Icon = type === 'shield' ? ShieldCheck : type === 'lock' ? LockKeyhole : type === 'bolt' ? Cpu : Clock3;
  return <span className="feature-icon"><Icon size={20} strokeWidth={1.8} /></span>;
}

function Home() {
  return <div className="site-shell">
    <Header active="home" />
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">Now available for Windows</div>
            <h1>Protection that <em>stays</em> out of the way.</h1>
            <p className="hero-lede">Drexora Guard is a desktop security application built to help you monitor and protect your system — straightforward, lightweight, and made to run quietly in the background.</p>
            <div className="hero-actions"><Link href="/download" className="button large">Download for Windows <ArrowDownToLine size={17} /></Link><a href="#features" className="button outline large">See features <ArrowRight size={16} /></a></div>
            <div className="hero-meta"><span>Free download</span><span>Windows 10 & 11</span><span>Version 1.0</span></div>
          </div>
          <div className="hero-visual" aria-label="Drexora Guard protection status illustration">
            <div className="visual-halo" /><div className="shield-orbit" />
            <div className="shield-card"><img src={mark} alt="" /><strong>System watched</strong><Check size={17} color="hsl(74 66% 55%)" /></div>
            <div className="telemetry"><div className="telemetry-label"><span>Guard status</span><span>Live</span></div><div className="telemetry-value">Quiet & steady</div><div className="telemetry-bars" aria-hidden="true">{[1,2,3,4,5,6,7].map((bar) => <i key={bar} />)}</div></div>
          </div>
        </div>
      </section>
      <section className="section" id="features">
        <div className="container">
          <div className="section-heading"><div className="eyebrow">What it does</div><h2>A clear view of your system, without the noise.</h2><p>Drexora Guard is designed around one job: helping you monitor and protect your computer, without getting in your way.</p></div>
          <div className="feature-layout">
            <div className="feature-aside"><div className="feature-aside-number">04</div><p>Focused tools for the moments when you want to know your PC is in good hands.</p></div>
            <div className="feature-grid">
              <article className="feature-card"><FeatureIcon type="shield" /><h3>System monitoring</h3><p>Keeps an eye on your system so you have a clearer picture of what’s happening on your PC.</p></article>
              <article className="feature-card"><FeatureIcon type="lock" /><h3>Protection tools</h3><p>Practical protection features aimed at helping safeguard your system from common risks.</p></article>
              <article className="feature-card"><FeatureIcon type="bolt" /><h3>Lightweight</h3><p>Built to run on your desktop without weighing your system down.</p></article>
              <article className="feature-card"><FeatureIcon type="clock" /><h3>Simple to use</h3><p>A clean, straightforward interface so protecting your PC doesn’t need to be complicated.</p></article>
            </div>
          </div>
          <div className="signal-strip"><span><b />Quiet by design</span><span><b />Made for Windows</span><span><b />Straightforward controls</span><span><b />No distractions</span></div>
        </div>
      </section>
      <section className="section tint" id="requirements">
        <div className="container requirements-layout">
          <div className="section-heading"><div className="eyebrow">Before you install</div><h2>Ready for your everyday PC.</h2><p>Drexora Guard keeps its footprint sensible so you can get on with the work, play, and life happening on your computer.</p></div>
          <div>
            <div className="requirements-table">
              <div className="requirement-row"><strong>Operating system</strong><span>Windows 10 or Windows 11 (64-bit)</span></div>
              <div className="requirement-row"><strong>Disk space</strong><span>200 MB free space minimum</span></div>
              <div className="requirement-row"><strong>Memory</strong><span>4 GB RAM recommended</span></div>
              <div className="requirement-row"><strong>Internet</strong><span>Required for installation and updates</span></div>
            </div>
            <div className="requirements-foot"><p>Version 1.0 · Free to download</p><Link href="/download" className="button">Go to download <ArrowRight size={15} /></Link></div>
          </div>
        </div>
      </section>
      <section className="cta-band"><div className="container cta-layout"><div><h2>One less thing to worry about.</h2><p>Download Drexora Guard and get it running in a few minutes.</p></div><Link href="/download" className="button light large">Download Drexora Guard <ArrowDownToLine size={17} /></Link></div></section>
    </main>
    <Footer />
  </div>;
}

function DownloadPage() {
  const [notice, setNotice] = useState(false);
  return <div className="site-shell">
    <Header active="download" />
    <main>
      <section className="download-hero">
        <div className="container download-grid">
          <div><div className="eyebrow">The Windows installer</div><h1>Download Drexora Guard.</h1><p>Free desktop security application for Windows. Built to help you monitor and protect your system, with a quiet footprint.</p></div>
          <div className="download-box">
            <div className="download-box-top"><strong>Drexora Guard Setup</strong><span className="status-pill">Windows</span></div>
            <button className="button large" onClick={() => setNotice(true)}><Download size={17} /> Download for Windows</button>
            <div className="download-box-meta"><span>Version 1.0</span><span>64-bit .exe</span></div>
            {notice && <div className="download-message" role="status">The installer is not bundled yet. This button is ready for the official Drexora Guard setup file.</div>}
          </div>
        </div>
      </section>
      <section className="download-details">
        <div className="container">
          <div className="install-layout">
            <div className="section-heading"><div className="eyebrow">Once the file is ready</div><h2>Installing Drexora Guard.</h2><p>Getting set up should feel as straightforward as using the app.</p></div>
            <div><div className="steps">
              <div className="step"><span className="step-number">01</span><div><h3>Download the installer</h3><p>Click the download button above to get the Drexora Guard setup file (.exe).</p></div></div>
              <div className="step"><span className="step-number">02</span><div><h3>Run the setup file</h3><p>Open the downloaded file and follow the on-screen instructions to install Drexora Guard on your PC.</p></div></div>
              <div className="step"><span className="step-number">03</span><div><h3>Launch Drexora Guard</h3><p>Once installation finishes, open Drexora Guard from your desktop or Start menu to begin using it.</p></div></div>
            </div><div className="safety-note"><strong>Safety note</strong><p>Only download Drexora Guard from this official page. If your browser or Windows shows a security prompt during installation, make sure the publisher is Drexora before continuing.</p></div></div>
          </div>
          <div className="download-facts"><div className="fact"><small>Platform</small><strong><MonitorCheck size={15} /> Windows 10 / 11</strong></div><div className="fact"><small>Installer</small><strong><HardDrive size={15} /> .exe package</strong></div><div className="fact"><small>Memory</small><strong><Cpu size={15} /> 4 GB recommended</strong></div></div>
        </div>
      </section>
    </main>
    <Footer />
  </div>;
}

function NotFoundPage() {
  return <><Header active="home" /><main className="not-found"><div><div className="eyebrow">Signal lost</div><h1>That page isn’t here.</h1><p style={{ marginTop: 18, color: 'hsl(var(--muted-foreground))' }}>Return to the Drexora Guard home page.</p><Link href="/" className="button" style={{ marginTop: 25 }}>Back home <ArrowRight size={15} /></Link></div></main><Footer /></>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/download" component={DownloadPage} /><Route component={NotFoundPage} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;