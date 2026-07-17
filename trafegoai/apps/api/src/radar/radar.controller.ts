import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { RadarService } from './radar.service';

class AnalyzePostDto {
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() description?: string;
  @IsString() niche: string;
  @IsIn(['VIEWS', 'SEGUIDORES', 'VENDAS', 'LEADS']) goal: string;
}

/** Radar de Tendências: produtos em alta, vídeos em alta e planejador de postagem. */
@Controller('radar')
@UseGuards(JwtGuard)
export class RadarController {
  constructor(private radar: RadarService) {}

  @Get('products')
  products(@Query('country') country?: string, @Query('category') category?: string, @Query('platform') platform?: string) {
    return this.radar.products({ country, category, platform });
  }

  @Get('videos')
  videos(@Query('platform') platform?: string, @Query('country') country?: string, @Query('category') category?: string) {
    return this.radar.videos({ platform, country, category });
  }

  @Get('posting-windows')
  postingWindows() {
    return this.radar.postingWindows();
  }

  @Post('analyze-post')
  analyze(@Body() dto: AnalyzePostDto) {
    return this.radar.analyzePost(dto);
  }
}
