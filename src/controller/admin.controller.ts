import {
  Controller,
  Get,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { AdminService } from '../service/admin.service';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @ApiOperation({ summary: 'Get daily storage usage statistics for all users' })
  @ApiResponse({
    status: 200,
    description: 'Returns daily user storage statistics',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @Get('stats')
  async getDailyStats(): Promise<{
    success: boolean;
    date: string;
    totalUsers: number;
    stats: Array<{
      userId: string;
      username: string;
      email: string;
      uploadedBytes: number;
      uploadedBytesFormatted: string;
      fileCount: number;
    }>;
  }> {
    try {
      const stats = await this.adminService.getDailyStats();
      return {
        success: true,
        date: new Date().toISOString().split('T')[0],
        totalUsers: stats.length,
        stats,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        {
          success: false,
          message: `Failed to retrieve stats: ${errorMessage}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
