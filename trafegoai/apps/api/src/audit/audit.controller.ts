import { Controller, Get, UseGuards } from '@nestjs/common';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(@Auth() auth: JwtPayload) {
    return this.audit.list(auth.orgId);
  }
}
