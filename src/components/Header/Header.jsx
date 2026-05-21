import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="header__inner">
        <a className="header__brand" href="/">
          <span className="header__logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="14" fill="#1a1a1a" />
              <path d="M20 22h22a6 6 0 0 1 0 12h-2v4a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V22zm22 4v6a2 2 0 0 0 0-6z" fill="#e8c39e" />
            </svg>
          </span>
          <span className="header__wordmark">
            Melbourne <em>Cafe</em> Finder
          </span>
        </a>

        <nav className="header__nav" aria-label="Primary">
          <a href="#about">About</a>
          <a href="#submit">Submit a cafe</a>
        </nav>
      </div>
    </header>
  );
}
