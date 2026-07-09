import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';

export interface JwtPayload {
  sub: string; // userId
  orgId: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(email: string, name: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('E-mail já cadastrado');
    const user = await this.prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 10) },
    });
    const org = await this.prisma.organization.create({ data: { name: `${name} — Workspace` } });
    await this.prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: 'ADMIN' } });
    return this.issue(user.id, org.id, 'ADMIN');
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    const m = user.memberships[0];
    return this.issue(user.id, m.orgId, m.role);
  }

  // PONTO DE INTEGRAÇÃO — Google OAuth (login do usuário):
  // trocar `code` por tokens em https://oauth2.googleapis.com/token usando
  // GOOGLE_OAUTH_CLIENT_ID/SECRET, buscar o perfil e criar/vincular o usuário via googleId.
  async loginWithGoogle(_code: string) {
    throw new UnauthorizedException('Login Google requer GOOGLE_OAUTH_CLIENT_ID configurado');
  }

  async me(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    const org = await this.prisma.organization.findUnique({ where: { id: payload.orgId } });
    return { user: { id: user!.id, email: user!.email, name: user!.name }, org, role: payload.role };
  }

  private issue(userId: string, orgId: string, role: string) {
    const payload: JwtPayload = { sub: userId, orgId, role };
    return { accessToken: this.jwt.sign(payload) };
  }
}
