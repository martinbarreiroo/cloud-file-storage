import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../../service/users.service';
import { JwtPayload } from '../../interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret',
    });
  }

  async validate(payload: JwtPayload) {
    // Fetch the user from the database
    const user = await this.usersService.findOneById(payload.sub);
    if (!user) {
      return null;
    }
    // Return the full user object with id, username, and email
    return {
      id: user.id,
      username: user.username,
      email: user.email,
    };
  }
}
