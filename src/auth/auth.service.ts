import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const adminUser = this.configService.get<string>('ADMIN_USER', 'admin');
    const adminPass = this.configService.get<string>('ADMIN_PASSWORD', 'adminpassword');

    if (username === adminUser && pass === adminPass) {
      return { username };
    }
    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: 'admin_user_id' };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
