import { Request } from 'express';

export interface JwtUser {
  id: string;
  email: string;
  username: string;
}

export interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    username: string;
  };
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
}
