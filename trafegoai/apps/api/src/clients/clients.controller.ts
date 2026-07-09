import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../common/prisma.service';

class ClientDto {
  @IsString() @MinLength(2) name: string;
}

/** Clientes da agência (modo agência). */
@Controller('clients')
@UseGuards(JwtGuard)
export class ClientsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Auth() auth: JwtPayload) {
    return this.prisma.client.findMany({
      where: { orgId: auth.orgId },
      include: { accounts: { select: { id: true, name: true, platform: true, status: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  create(@Auth() auth: JwtPayload, @Body() dto: ClientDto) {
    return this.prisma.client.create({ data: { name: dto.name, orgId: auth.orgId } });
  }
}
