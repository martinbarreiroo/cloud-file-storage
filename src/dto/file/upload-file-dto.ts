import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({
    description: 'The name of the file',
    example: 'document.pdf',
  })
  @IsNotEmpty()
  @IsString()
  filename: string;

  @ApiProperty({
    description:
      'Optional: Content type of the file. If not provided, it will be auto-detected on the backend.',
    example: 'application/pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiProperty({
    description: 'Optional description of the file',
    example: 'My important document',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
