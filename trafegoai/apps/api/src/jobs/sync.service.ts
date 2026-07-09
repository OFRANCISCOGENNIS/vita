import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

export const SYNC_QUEUE = 'metrics-sync';
export const RULES_QUEUE = 'automation-rules';

export function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null,
  };
}

/**
 * Produtor de jobs (API): enfileira sincronizações e agenda os jobs repetíveis.
 * O consumo acontece no processo worker (jobs/worker.main.ts).
 */
@Injectable()
export class SyncService implements OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private syncQueue = new Queue(SYNC_QUEUE, { connection: redisConnection() });
  private rulesQueue = new Queue(RULES_QUEUE, { connection: redisConnection() });

  constructor() {
    this.scheduleRecurring().catch((e) => this.logger.warn(`Redis indisponível — jobs agendados desativados (${e.message})`));
  }

  /** Agenda: sync de métricas a cada hora; regras de automação a cada 15 min. */
  private async scheduleRecurring() {
    await this.syncQueue.add('sync-all', {}, { repeat: { pattern: '0 * * * *' }, jobId: 'sync-all-hourly' });
    await this.rulesQueue.add('run-rules', {}, { repeat: { pattern: '*/15 * * * *' }, jobId: 'rules-15min' });
  }

  /** Botão "sincronizar agora" de uma conta específica. */
  async enqueueSync(accountId: string) {
    await this.syncQueue.add('sync-account', { accountId }, { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.syncQueue.close(), this.rulesQueue.close()]);
  }
}
