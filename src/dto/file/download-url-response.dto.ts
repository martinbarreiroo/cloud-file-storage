import { ApiProperty } from '@nestjs/swagger';

export class DownloadUrlResponseDto {
  @ApiProperty({
    description:
      'The pre-signed URL to download the file directly from cloud storage.',
    example: 'https://s3.example.com/bucket/file?signature=...',
  })
  downloadUrl: string;

  @ApiProperty({
    description: 'The original filename.',
    example: 'mydocument.pdf',
  })
  filename: string;

  @ApiProperty({
    description: 'The content type of the file.',
    example: 'application/pdf',
  })
  contentType: string;
}
