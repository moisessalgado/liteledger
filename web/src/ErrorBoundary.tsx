import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
          <h1>Algo deu errado</h1>
          <p>Ocorreu um erro inesperado na aplicacao. Tente recarregar a pagina.</p>
          {this.state.error && (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", color: "#c53030" }}>
              {this.state.error.message}
            </pre>
          )}
          <button type="button" onClick={this.handleReset} style={{ marginTop: "1rem" }}>
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
