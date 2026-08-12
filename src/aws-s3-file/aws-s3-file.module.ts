
import { Module } from '@nestjs/common';
import { S3Service } from 'src/s3.service';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads', // Destination folder for temporarily storing files
    }),
  ],
  providers: [S3Service],
})

export class AwsS3FileModule {}
