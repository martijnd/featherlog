const AUTHOR_URL = "https://www.martijndorsman.nl";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-text">
        Made by{" "}
        <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
          Martijn Dorsman
        </a>
      </p>
    </footer>
  );
}
