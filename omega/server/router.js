// Camada 5 — IA Suprema (Model Router): único componente que fala com provedores
// de modelo. Cascata de fallback: Anthropic → OpenAI → motor local (sempre
// disponível, garante degradação graciosa sem chave de API).

const PROVIDERS = [
  {
    name: 'anthropic',
    model: process.env.OMEGA_ANTHROPIC_MODEL || 'claude-sonnet-5',
    available: () => !!process.env.ANTHROPIC_API_KEY,
    async complete(system, messages) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model: this.model, max_tokens: 1024, system, messages })
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content.map(b => b.text || '').join('');
    }
  },
  {
    name: 'openai',
    model: process.env.OMEGA_OPENAI_MODEL || 'gpt-4o-mini',
    available: () => !!process.env.OPENAI_API_KEY,
    async complete(system, messages) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: this.model, max_tokens: 1024,
          messages: [{ role: 'system', content: system }, ...messages]
        })
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  {
    name: 'local',
    model: 'omega-reflex-v0',
    available: () => true,
    // Motor local determinístico: sem chave de API a plataforma continua
    // operando em modo degradado, respondendo a partir da persona do agente,
    // da memória recuperada e da própria mensagem.
    async complete(system, messages) {
      const user = messages.filter(m => m.role === 'user').at(-1)?.content || '';
      const agent = (system.match(/Você é ([A-Z ]+),/) || [])[1] || 'OMEGA';
      const memo = (system.match(/Fatos conhecidos sobre o usuário:\n([\s\S]*?)(?:\n\n|$)/) || [])[1];
      const lines = [
        `[modo local — sem chave de API configurada] Agente ${agent.trim()} respondendo.`,
        '',
        `Recebi sua solicitação: "${user.slice(0, 300)}"`
      ];
      if (memo) lines.push('', 'Contexto que já sei sobre você:', memo.trim());
      lines.push(
        '',
        'Plano proposto:',
        '1. Interpretar a solicitação dentro do meu domínio.',
        '2. Recuperar contexto relevante da Memória Universal.',
        '3. Produzir a resposta e submetê-la ao OMEGA PRIME.',
        '',
        'Para respostas completas com modelo de linguagem real, configure ANTHROPIC_API_KEY ou OPENAI_API_KEY no ambiente e reinicie o servidor.'
      );
      return lines.join('\n');
    }
  }
];

export function availableProviders() {
  return PROVIDERS.map(p => ({ name: p.name, model: p.model, available: p.available() }));
}

// Roteia com fallback em cascata; nunca lança — o provedor local é infalível.
export async function route(system, messages) {
  for (const p of PROVIDERS) {
    if (!p.available()) continue;
    try {
      const text = await p.complete(system, messages);
      return { provider: p.name, model: p.model, text };
    } catch (err) {
      console.error(`[router] ${p.name} falhou: ${err.message}; tentando próximo provedor`);
    }
  }
  // inalcançável (local é sempre disponível), mas por segurança:
  return { provider: 'local', model: 'omega-reflex-v0', text: 'Falha em todos os provedores.' };
}
