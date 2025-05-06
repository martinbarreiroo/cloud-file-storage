import { ApiProperty } from '@nestjs/swagger';

export class FileResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the file',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'The name of the file',
    example: 'document.pdf',
  })
  filename: string;

  @ApiProperty({
    description: 'Content type of the file',
    example: 'application/pdf',
  })
  contentType: string;

  @ApiProperty({
    description: 'Size of the file in bytes',
    example: 1048576,
  })
  size: number;

  @ApiProperty({
    description: 'Optional description of the file',
    example: 'My important document',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'URL to access the file',
    example: 'https://storage-url.com/path/to/file',
    required: false,
  })
  url?: string;

  @ApiProperty({
    description: 'The storage provider used',
    example: 'azure',
  })
  provider: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-05-05T18:39:24.480Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-05-05T18:39:24.480Z',
  })
  updatedAt: Date;
}
