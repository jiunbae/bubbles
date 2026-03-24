import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const t = i18n.t.bind(i18n);

      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl opacity-60">:(</div>
          <h1 className="text-xl font-semibold text-text-primary">
            {t('errors.somethingWentWrong')}
          </h1>
          <p className="max-w-md text-sm text-text-secondary">
            {this.state.error?.message ?? t('errors.unexpectedError')}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
            className="mt-2 rounded-lg bg-accent px-5 py-2 text-white transition-colors hover:bg-accent-hover"
          >
            {t('common.reload')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
