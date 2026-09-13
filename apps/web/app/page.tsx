export default function HomePage() {
  return (
    <main className="foundation-shell">
      <section className="foundation-panel">
        <p className="eyebrow">Talent Network</p>
        <h1>Employment infrastructure, not another job board.</h1>
        <p className="lede">
          The product shell is live. Candidate, employer, and admin surfaces will now be implemented
          against the repository architecture and UX specifications.
        </p>
        <dl className="status-grid">
          <div>
            <dt>Architecture</dt>
            <dd>Modular monolith + scalable workers</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>PostgreSQL transactional truth</dd>
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
