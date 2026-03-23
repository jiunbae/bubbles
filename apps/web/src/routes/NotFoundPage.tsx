import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <div className="text-7xl opacity-60">404</div>
      <h1 className="text-2xl font-semibold text-text-primary">
        This bubble popped
      </h1>
      <p className="text-text-secondary">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/"
        className="rounded-lg bg-accent px-5 py-2.5 text-white transition-colors hover:bg-accent-hover"
      >
        Back to Lobby
      </Link>
    </div>
  );
}
