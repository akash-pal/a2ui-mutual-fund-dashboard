"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors from its children (e.g. a malformed LLM-generated
 * structure that somehow slips past AnyCatalogComponentSchema's validation)
 * so one bad response shows a recoverable error instead of taking down the
 * whole page, including the query input above it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}
