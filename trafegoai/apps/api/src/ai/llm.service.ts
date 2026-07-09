import { Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TRAFFIC_MANAGER } from './prompts';

/**
 * Cliente LLM (Claude). Com ANTHROPIC_API_KEY configurada, chama a API real;
 * sem chave, devolve null e os serviços caem no modo heurístico/mock —
 * assim o produto demonstra valor mesmo antes de configurar a IA.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  get enabled(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async complete(prompt: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 2048,
          system: SYSTEM_TRAFFIC_MANAGER,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        this.logger.warn(`LLM respondeu ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
      return data.content.find((b) => b.type === 'text')?.text ?? null;
    } catch (err) {
      this.logger.error(`Falha ao chamar LLM: ${err}`);
      return null;
    }
  }
}
