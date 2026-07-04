# OMEGA JARVIS X — MVP Fase 1

Implementação real da **Fase 1 (MVP cognitivo)** do roadmap descrito em
[`docs/OMEGA_JARVIS_ARCHITECTURE.md`](../docs/OMEGA_JARVIS_ARCHITECTURE.md):
orquestrador, model router multi-provedor, os 14 agentes permanentes,
memória persistente e o cockpit web conectado ao backend.

**Zero dependências externas** — apenas Node.js ≥ 18. Não precisa de `npm install`.

## Como rodar

```bash
cd omega
node server/index.js
# → OMEGA JARVIS X online → http://localhost:8420
```

Abra `http://localhost:8420` no navegador.

### Com modelo de linguagem real

Sem chave de API o sistema opera em **modo local** (motor determinístico —
respostas limitadas, mas toda a plataforma funciona). Para respostas reais:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # preferido (Claude)
# ou
export OPENAI_API_KEY=sk-...          # fallback
node server/index.js
```

O Model Router usa a cascata **anthropic → openai → local** com fallback
automático em caso de erro ou indisponibilidade.

## O que já é real (não simulado)

| Componente | Camada da arquitetura | Implementação |
|------------|----------------------|---------------|
| Orquestrador | C2 — OMEGA Core | Classifica intenção, seleciona agentes, executa em paralelo, valida com OMEGA PRIME |
| 14 agentes permanentes | C3 | Agent Specs declarativos (persona + gatilhos de domínio) em `server/agents.js` |
| Model Router | C5 | Adapters Anthropic/OpenAI + motor local; cascata de fallback |
| Memória | C4 | Fatos persistidos em disco (`data/facts.json`), extração automática ("meu nome é…", "meu objetivo é…"), recuperação por relevância, histórico por sessão, direito ao esquecimento (`DELETE /api/memory/:i`) |
| Motor de Automação | C7 | `server/automation.js` — fluxos armazenados, runtime encadeado, framework de conectores e **portão de aprovação humana** para toda ação externa |
| API | C16 | REST + SSE (progresso de tarefas e execução de fluxos em tempo real) |
| Cockpit | C1/C17 | `web/index.html` — chat, agentes ao vivo, provedores, memória e Central de Automações com aprovação de ações externas |

### Motor de Automação (Camada 7)

Um fluxo é uma sequência de passos, cada um um conector:

| Conector | Externo? | O que faz |
|----------|----------|-----------|
| `trigger` | não | Ponto de entrada (manual/webhook) |
| `summarize` | não | Resume conteúdo via Model Router (IA) |
| `transform` | não | Formata com template `${campo}` do envelope |
| `slack` | **sim** | Envia mensagem (webhook real ou dry-run) |
| `http` | **sim** | Requisição HTTPS arbitrária |

Passos marcados **externos** disparam o portão de aprovação: a execução
**pausa** e só prossegue com `POST /api/runs/:id/approve` (ou é abortada com
`/reject`). Nenhuma ação no mundo externo acontece sem aprovação humana —
salvo `autoApprove: true` explícito na chamada.

## API

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/status` | GET | Estado do núcleo, agentes, tarefas, provedores |
| `/api/agents` | GET | Lista dos 14 agentes |
| `/api/chat` | POST `{sessionId, text}` | Executa a tarefa; resposta em SSE (`plan`, `step`, `memory`, `final`, `done`) |
| `/api/memory` | GET | Fatos aprendidos |
| `/api/memory/:i` | DELETE | Esquecer um fato |
| `/api/connectors` | GET | Conectores disponíveis (e quais são externos) |
| `/api/flows` | GET / POST | Listar / criar fluxos |
| `/api/flows/:id/run` | POST `{input, autoApprove}` | Executar (SSE: `run:start`, `run:step`, `run:approval`, `run:end`) |
| `/api/flows/:id/activate` | POST | Ativar/desativar fluxo |
| `/api/runs` | GET | Histórico de execuções + aprovações pendentes |
| `/api/runs/:id/approve` \| `/reject` | POST | Aprovar ou rejeitar uma ação externa pausada |

## Testes

```bash
cd omega
npm test        # sobe o servidor em porta efêmera e exercita toda a API
```

## Próximos passos

- Streaming de tokens (hoje o SSE emite progresso por etapa, não por token)
- Banco vetorial para a memória semântica (Qdrant)
- Multiusuário com autenticação (hoje é single-tenant local)
- Gatilhos agendados/webhook de entrada para disparar fluxos automaticamente
- KAPPA gerando fluxos automaticamente a partir de linguagem natural
