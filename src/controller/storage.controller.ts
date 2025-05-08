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
  Res,
  Logger,
  StreamableFile,
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
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { RequestWithUser } from 'src/interfaces/user.interface';
import { Response } from 'express';

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

  @ApiOperation({ summary: 'Download a file' })
  @ApiResponse({ status: 200, description: 'File downloaded successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiBearerAuth()
  @ApiParam({ name: 'fileId', description: 'The ID of the file to download' })
  @UseGuards(JwtAuthGuard)
  @Get('download')
  async downloadFile(
    @Query('fileId') fileId: string,
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    try {
      const { stream, metadata } =
        await this.storageService.getDownloadableFileData(fileId, req.user.id);

      res.setHeader('Content-Type', metadata.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${metadata.filename}"`,
      );
      return new StreamableFile(stream);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          'File not found or access denied',
          HttpStatus.NOT_FOUND,
        );
      }
      if (error instanceof HttpException) {
        if (error.getStatus() === (HttpStatus.FORBIDDEN as number)) {
          throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
        }
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error downloading file ${fileId}: ${errorMessage}`);
      throw new HttpException(
        'Failed to download file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
