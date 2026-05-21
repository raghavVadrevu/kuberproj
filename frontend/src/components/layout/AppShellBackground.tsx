/** Animated gradient mesh behind authenticated app routes. */
export default function AppShellBackground() {
  return (
    <div className="app-shell-bg" aria-hidden>
      <div className="app-shell-shimmer" />
      <div className="app-shell-orb app-shell-orb--primary" />
      <div className="app-shell-orb app-shell-orb--accent" />
      <div className="app-shell-orb app-shell-orb--depth" />
      <div className="app-shell-orb app-shell-orb--glow" />
    </div>
  )
}
