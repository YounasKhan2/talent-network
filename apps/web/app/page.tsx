import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="foundation-shell">
      <section className="foundation-panel">
        <div className="landing-topline">
          <p className="eyebrow">Talent Network</p>
          <div className="landing-actions">
            <Link className="text-action" href="/login">
              Sign in
            </Link>
            <Link className="compact-action" href="/signup">
              Create account
            </Link>
          </div>
        </div>

        <h1>Employment infrastructure, not another job board.</h1>
        <p className="lede">
          A hiring network built around reusable career identity, explainable matching, verified
          organizations, and recruiter workflows designed for signal instead of application volume.
        </p>

        <div className="landing-cta-row">
          <Link className="primary-link" href="/signup">
            Build your network profile
          </Link>
          <Link className="secondary-link" href="/login">
            Open your workspace
          </Link>
        </div>

        <dl className="status-grid">
          <div>
            <dt>Architecture</dt>
            <dd>Modular monolith + scalable workers</dd>
          </div>
          <div>
            <dt>Identity</dt>
            <dd>Secure sessions, tenancy and permission bundles</dd>
          </div>
          <div>
            <dt>Processing</dt>
            <dd>Async resume, matching, AI and notifications</dd>
          </div>
          <div>
            <dt>Decision model</dt>
            <dd>Explainable AI, human-controlled hiring</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
