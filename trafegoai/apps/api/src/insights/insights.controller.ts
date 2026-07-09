import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(JwtGuard)
export class InsightsController {
  constructor(private svc: InsightsService) {}

  @Get('diagnostics')
  diagnostics(@Auth() auth: JwtPayload) {
    return this.svc.diagnostics(auth.orgId);
  }

  @Get('recommendations')
  recommendations(@Auth() auth: JwtPayload) {
    return this.svc.listRecommendations(auth.orgId);
  }

  @Post('recommendations/:id/apply')
  apply(@Auth() auth: JwtPayload, @Param('id') id: string) {
    return this.svc.applyRecommendation(auth, id);
  }

  @Post('recommendations/:id/undo')
  undo(@Auth() auth: JwtPayload, @Param('id') id: string) {
    return this.svc.undoRecommendation(auth, id);
  }

  @Post('recommendations/:id/dismiss')
  dismiss(@Auth() auth: JwtPayload, @Param('id') id: string) {
    return this.svc.dismissRecommendation(auth, id);
  }

  @Get('anomalies')
  anomalies(@Auth() auth: JwtPayload) {
    return this.svc.listAnomalies(auth.orgId);
  }

  @Post('anomalies/detect')
  detect(@Auth() auth: JwtPayload) {
    return this.svc.detectAnomalies(auth.orgId);
  }

  @Get('creatives/ranking')
  creatives(@Auth() auth: JwtPayload) {
    return this.svc.creativeRanking(auth.orgId);
  }
}
