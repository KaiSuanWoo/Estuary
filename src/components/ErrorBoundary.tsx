import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-wide safety net. Without this, any uncaught render error blanks the whole
 * screen to white — especially confusing for beta users on a phone. Here we
 * catch it and offer a way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the console / remote logs; kept lightweight on purpose.
    console.error("Uncaught render error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.assign("/");
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
          <div className="w-full max-w-sm rounded-2xl border border-rule/80 bg-ink-900/60 p-6">
            <h1 className="text-lg font-semibold text-quill">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-quill-soft">
              The app hit an unexpected error. Reloading usually fixes it — your
              data is safe.
            </p>
            <button
              onClick={this.handleReload}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-teal-500 text-sm font-medium text-ink-950 transition-colors hover:bg-teal-400"
            >
              Reload Estuary
            </button>
            {import.meta.env.DEV && (
              <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-ink-950/60 p-3 text-left text-[11px] leading-relaxed text-rose-300">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
