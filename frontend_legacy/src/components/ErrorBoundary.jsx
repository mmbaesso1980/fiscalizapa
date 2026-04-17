import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          maxWidth: '600px', margin: '80px auto', padding: '40px 24px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9888;&#65039;</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Algo deu errado
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
            Ocorreu um erro inesperado. Tente recarregar a pagina.
          </p>
          <button onClick={() => window.location.reload()} style={{
            padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
            background: 'var(--accent-green)', color: '#fff', border: 'none', cursor: 'pointer'
          }}>
            Recarregar pagina
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
