import {
  Controller,
  UseGuards,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Request,
  Logger,
  Get,
  Param,
  NotFoundException,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UploadFileDto } from 'src/dto/file/upload-file-dto';
import { StorageService } from 'src/service/storage.service';
import {
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AzureStorageProvider } from 'src/providers/azure-storage.provider';
import { MinioStorageProvider } from 'src/providers/minio-storage.provider';
import { RequestWithUser } from 'src/interfaces/user.interface';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(
    private storageService: StorageService,
    private azureStorageProvider: AzureStorageProvider,
    private minioStorageProvider: MinioStorageProvider,
  ) {}

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

  @ApiOperation({ summary: 'Test Azure blob storage directly' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully to Azure',
  })
  @ApiResponse({ status: 400, description: 'Failed to upload to Azure' })
  @UseGuards(JwtAuthGuard)
  @Post('test-azure')
  @UseInterceptors(FileInterceptor('file'))
  async testAzureUpload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: RequestWithUser,
  ) {
    try {
      // Log the user object to understand its structure
      this.logger.debug(`User object: ${JSON.stringify(req.user)}`);

      // Use the id property from the user object
      const userId = req.user.id;

      // Test the Azure provider directly
      const result = await this.azureStorageProvider.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        userId,
        'Test file upload',
      );

      return {
        success: true,
        message: 'File uploaded successfully to Azure',
        fileDetails: result,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorResponse = {
        success: false,
        message: `Failed to upload to Azure: ${errorMessage}`,
      };
      throw new HttpException(errorResponse, HttpStatus.BAD_REQUEST);
    }
  }

  @ApiOperation({ summary: 'Test MinIO storage directly' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully to MinIO',
  })
  @ApiResponse({ status: 400, description: 'Failed to upload to MinIO' })
  @UseGuards(JwtAuthGuard)
  @Post('test-minio')
  @UseInterceptors(FileInterceptor('file'))
  async testMinioUpload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: RequestWithUser,
  ) {
    try {
      // Use the id property from the user object
      const userId = req.user.id;

      // Test the MinIO provider directly
      const result = await this.minioStorageProvider.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        userId,
        'Test file upload to MinIO',
      );

      return {
        success: true,
        message: 'File uploaded successfully to MinIO',
        fileDetails: result,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorResponse = {
        success: false,
        message: `Failed to upload to MinIO: ${errorMessage}`,
      };
      throw new HttpException(errorResponse, HttpStatus.BAD_REQUEST);
    }
  }

  @ApiOperation({ summary: 'Check provider status' })
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async checkProviders() {
    try {
      // Check the status of both providers
      const status = await this.storageService.checkProviders();

      return {
        success: true,
        message: 'Provider status retrieved successfully',
        providers: {
          primary: {
            name: this.storageService['primaryProvider'].getProviderName(),
            status: status.primary ? 'available' : 'unavailable',
          },
          backup: {
            name: this.storageService['backupProvider'].getProviderName(),
            status: status.backup ? 'available' : 'unavailable',
          },
        },
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
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({
    status: 200,
    description: 'File metadata retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @UseGuards(JwtAuthGuard)
  @Get('files/:id')
  async getFileById(@Param('id') id: string) {
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
