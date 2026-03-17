const ProjetosSection = () => {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
      padding: '24px', border: '1px solid var(--border-light)'
    }}>
      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
        Proposicoes Legislativas
      </h3>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
        padding: '40px', textAlign: 'center', marginTop: '12px'
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#128218;</div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Em breve
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Os dados de proposicoes legislativas serao integrados em breve.
        </p>
      </div>
    </div>
  );
};

export default ProjetosSection;
