export function SkeletonInbox() {
  return (
    <div className="workspace is-skeleton" aria-busy="true" aria-label="Loading inbox">
      <div className="sidebar">
        <div className="sidebar-brand">
          <span className="sk sk-logo" />
          <span className="sk sk-line" style={{ width: 110 }} />
        </div>
        <span className="sk sk-button" />
        {[90, 70, 76, 82].map((w, i) => (
          <span key={i} className="sk sk-line sk-row" style={{ width: w }} />
        ))}
      </div>
      <section className="pane list-pane">
        <div className="list-head">
          <span className="sk sk-input" />
        </div>
        <div className="thread-scroll">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="sk-thread">
              <span className="sk sk-avatar" />
              <span className="sk-thread-main">
                <span className="sk sk-line" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                <span className="sk sk-line sk-thin" style={{ width: `${70 + ((i * 11) % 25)}%` }} />
              </span>
              <span className="sk sk-line sk-thin" style={{ width: 36 }} />
            </div>
          ))}
        </div>
      </section>
      <section className="pane read-pane">
        <div className="read-head">
          <span className="sk sk-line" style={{ width: '46%', height: 22 }} />
          <span className="sk sk-line sk-thin" style={{ width: '30%', marginTop: 10 }} />
        </div>
        <div className="message sk-message">
          <span className="sk sk-avatar" />
          <span className="sk-thread-main">
            <span className="sk sk-line" style={{ width: '28%' }} />
            <span className="sk sk-line sk-thin" style={{ width: '40%' }} />
          </span>
        </div>
        <div className="sk-body">
          {[92, 86, 60, 0, 78, 44].map((w, i) =>
            w === 0 ? <span key={i} className="sk-gap" /> : <span key={i} className="sk sk-line sk-thin" style={{ width: `${w}%` }} />,
          )}
        </div>
      </section>
    </div>
  );
}
