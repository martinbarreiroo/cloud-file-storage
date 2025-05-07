import { UserRolesEnum } from 'src/enums/user-roles.enum';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    username: string;
    email: string;
    role?: UserRolesEnum;
  };
}
