import {
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRolesEnum } from 'src/enums/user-roles.enum';
import { RequestWithUser } from 'src/interfaces/user.interface';

@Injectable()
export class AdminAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First run the JWT authentication
    const isAuthenticated = await super.canActivate(context);

    if (!isAuthenticated) {
      return false; // AuthGuard will handle this with 401 Unauthorized
    }

    // Now check if user is admin
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.role !== UserRolesEnum.ADMIN) {
      throw new ForbiddenException('Access denied: Admin privileges required');
    }

    return true;
  }
}
