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
    description: 'Content type of the file',
    example: 'application/pdf',
  })
  @IsNotEmpty()
  @IsString()
  contentType: string;

  @ApiProperty({
    description: 'Optional description of the file',
    example: 'My important document',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
