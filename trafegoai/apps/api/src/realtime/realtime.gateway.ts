import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Atualização em tempo real: o frontend entra na sala da organização e recebe
 * eventos de anomalia (`anomaly`), execução de regra (`rule-fired`) e fim de
 * sincronização (`sync-done`) sem precisar recarregar.
 */
@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`ws conectado: ${client.id}`);
  }

  @SubscribeMessage('join-org')
  join(client: Socket, orgId: string) {
    client.join(`org:${orgId}`);
    return { joined: orgId };
  }

  emitToOrg(orgId: string, event: string, payload: unknown) {
    this.server?.to(`org:${orgId}`).emit(event, payload);
  }
}
