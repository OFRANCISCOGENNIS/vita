import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService, JwtPayload } from './auth.service';
import { Auth, JwtGuard } from './jwt.guard';

class RegisterDto {
  @IsEmail() email: string;
  @IsString() name: string;
  @IsString() @MinLength(8) password: string;
}
class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.name, dto.password);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('google')
  google(@Body('code') code: string) {
    return this.auth.loginWithGoogle(code);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Auth() payload: JwtPayload) {
    return this.auth.me(payload);
  }
}
