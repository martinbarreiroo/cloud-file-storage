import {
  Controller,
  UseGuards,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Request,
  Get,
  NotFoundException,
  HttpStatus,
  HttpException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UploadFileDto } from 'src/dto/file/upload-file-dto';
import { StorageService } from 'src/service/storage.service';
import {
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { RequestWithUser } from 'src/interfaces/user.interface';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private storageService: StorageService) {}

  @ApiOperation({ summary: 'Upload a file to cloud storage' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request or file upload failed',
  })
  @ApiResponse({ status: 500, description: 'Server error during upload' })
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: UploadFileDto,
    @Request() req: RequestWithUser,
  ) {
    // Access id from JWT user object
    const result = await this.storageService.upload(
      file,
      metadata,
      req.user.id,
    );

    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }

    return result;
  }

  @ApiOperation({ summary: 'Check provider status' })
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async checkProviders() {
    try {
      // Check the status of all providers
      const status = await this.storageService.checkProviders();

      return {
        success: true,
        message: 'Provider status retrieved successfully',
        providers: Object.entries(status).map(([name, available]) => ({
          name,
          status: available ? 'available' : 'unavailable',
        })),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorResponse = {
        success: false,
        message: `Failed to check providers: ${errorMessage}`,
      };
      throw new HttpException(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get file metadata by ID' })
  @ApiQuery({ name: 'id', description: 'File ID' })
  @ApiResponse({
    status: 200,
    description: 'File metadata retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @UseGuards(JwtAuthGuard)
  @Get('file-data')
  async getFileById(@Query('id') id: string) {
    const file = await this.storageService.getFileById(id);

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    return {
      success: true,
      file,
    };
  }

  @ApiOperation({ summary: 'List all files for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Files listed successfully' })
  @ApiResponse({ status: 500, description: 'Failed to list files' })
  @UseGuards(JwtAuthGuard)
  @Get('files')
  async listUserFiles(@Request() req: RequestWithUser) {
    try {
      const userId = req.user.id;
      const files = await this.storageService.listUserFiles(userId);

      return {
        success: true,
        count: files.length,
        files,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorResponse = {
        success: false,
        message: `Failed to list files: ${errorMessage}`,
      };
      throw new HttpException(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
