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
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadFileDto } from '../dto/file/upload-file-dto';
import { StorageService } from '../service/storage.service';
import {
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RequestWithUser } from '../interfaces/user.interface';
import { Response } from 'express';
import { DownloadUrlResponseDto } from '../dto/file/download-url-response.dto';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private storageService: StorageService) {}

  @ApiOperation({ summary: 'Upload a file to cloud storage' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request or file upload failed',
  })
  @ApiResponse({ status: 500, description: 'Server error during upload' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: UploadFileDto,
    @Request() req: RequestWithUser,
  ) {
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
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async checkProviders() {
    try {
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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

  @ApiOperation({ summary: 'Get a secure URL to download a file' })
  @ApiResponse({
    status: 200,
    description: 'Download URL generated successfully',
    type: DownloadUrlResponseDto,
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'fileId', description: 'The ID of the file to download' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('download-url')
  async getDownloadUrl(
    @Query('fileId') fileId: string,
    @Request() req: RequestWithUser,
  ): Promise<DownloadUrlResponseDto> {
    try {
      const urlData = await this.storageService.getDownloadUrlData(
        fileId,
        req.user.id,
      );
      return urlData;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error getting download URL for file ${fileId}: ${errorMessage}`,
      );
      throw new HttpException(
        'Failed to get download URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
