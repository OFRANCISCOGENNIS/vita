import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Sessão expirada — faça login novamente');
    try {
      req.auth = this.jwt.verify<JwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Sessão expirada — faça login novamente');
    }
  }
}

/** Injeta o payload do JWT (sub, orgId, role) no handler. */
export const Auth = createParamDecorator((_data, ctx: ExecutionContext): JwtPayload => {
  return ctx.switchToHttp().getRequest().auth;
});
