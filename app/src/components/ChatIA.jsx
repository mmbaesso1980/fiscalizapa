import { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

/**
 * ChatIA - Componente de chat com IA por deputado
 * BLOCO 3: Perguntas personalizadas sobre cada politico
 * Inclui cache local para evitar gastos repetidos
 */
export default function ChatIA({ user, politicianId, politicianName, colecao }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const chatEndRef = useRef(null);
  const CACHE_KEY = `chat_cache_${colecao}_${politicianId}`;

  // Carregar mensagens do cache local
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setMessages(JSON.parse(cached));
    } catch (e) { /* ignore */ }
  }, [CACHE_KEY]);

  // Scroll automatico
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Salvar no cache
  function saveToCache(msgs) {
    try {
      // Manter ultimas 50 mensagens no cache
      const toSave = msgs.slice(-50);
      localStorage.setItem(CACHE_KEY, JSON.stringify(toSave));
    } catch (e) { /* storage full */ }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', text: input.trim(), ts: Date.now() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      const chat = httpsCallable(functions, 'chat');
      const result = await chat({
        message: userMsg.text,
        politicianId,
        politicianName,
      });
      const aiMsg = { role: 'ai', text: result.data.response, ts: Date.now() };
      const updatedMsgs = [...newMsgs, aiMsg];
      setMessages(updatedMsgs);
      saveToCache(updatedMsgs);
    } catch (e) {
      const errorMsg = { role: 'error', text: e.message || 'Erro ao processar mensagem.', ts: Date.now() };
      const updatedMsgs = [...newMsgs, errorMsg];
      setMessages(updatedMsgs);
    }
    setLoading(false);
  }

  function clearChat() {
    setMessages([]);
    localStorage.removeItem(CACHE_KEY);
  }

  // Sugestoes de perguntas
  const suggestions = [
    `Quais sao os maiores gastos de ${politicianName}?`,
    `${politicianName} tem indicios de irregularidades?`,
    `Como esta a presenca de ${politicianName} nas sessoes?`,
    `Quais projetos de lei ${politicianName} apresentou?`,
    `${politicianName} usa fretamento de aeronaves?`,
  ];

  if (!user) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '14px 20px', borderRadius: 12,
          border: '1px solid var(--accent-green)', cursor: 'pointer',
          background: isOpen ? 'var(--accent-green)' : 'transparent',
          color: isOpen ? '#fff' : 'var(--accent-green)',
          fontWeight: 700, fontSize: 15, display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {isOpen ? 'Fechar Chat IA' : `Chat IA sobre ${politicianName}`}
      </button>

      {isOpen && (
        <div style={{
          marginTop: 12, border: '1px solid var(--border-light)',
          borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border-light)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Chat IA - {politicianName}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                1 credito/msg
              </span>
              {messages.length > 0 && (
                <button onClick={clearChat} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 11,
                }}>Limpar</button>
              )}
            </div>
          </div>

          {/* Mensagens */}
          <div style={{
            maxHeight: 400, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  Faca perguntas sobre {politicianName}. Cada mensagem custa 1 credito.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(s); }}
                      style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: 12,
                        border: '1px solid var(--border-light)', cursor: 'pointer',
                        background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                        textAlign: 'left',
                      }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '10px 14px', borderRadius: 12,
                background: msg.role === 'user' ? 'var(--accent-green)'
                  : msg.role === 'error' ? '#fee2e2'
                  : 'var(--bg-primary)',
                color: msg.role === 'user' ? '#fff'
                  : msg.role === 'error' ? '#dc2626'
                  : 'var(--text-primary)',
                fontSize: 13, lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.text}
              </div>
            ))}

            {loading && (
              <div style={{
                alignSelf: 'flex-start', padding: '10px 14px',
                borderRadius: 12, background: 'var(--bg-primary)',
                color: 'var(--text-muted)', fontSize: 13,
              }}>
                Analisando...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: 12, borderTop: '1px solid var(--border-light)',
            display: 'flex', gap: 8,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={`Pergunte sobre ${politicianName}...`}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8,
                border: '1px solid var(--border-light)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: loading ? '#9ca3af' : 'var(--accent-green)',
                color: '#fff', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                fontSize: 13,
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
