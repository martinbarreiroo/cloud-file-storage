import { Request } from 'express';
import { UserRolesEnum } from 'src/enums/user-roles.enum';

export interface JwtUser {
  id: string;
  email: string;
  username: string;
  role?: UserRolesEnum;
}

export interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role?: UserRolesEnum;
  };
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  role?: UserRolesEnum;
}
