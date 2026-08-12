import { Injectable } from '@nestjs/common';
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { Upload } from '@aws-sdk/lib-storage';
// import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PassThrough } from 'stream';
import * as mime from 'mime-types';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import { promises as fs } from 'fs';
import { lookup as getMimeType } from 'mime-types';
import { basename, extname } from 'path';           // ← make sure these are imported

@Injectable()
export class S3Service {
  private s3: S3Client;
  private ses: SESClient;
  private transporter: nodemailer.Transporter;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey:
          process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    this.ses = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey:
          process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Initialize nodemailer transporter
    this.transporter = nodemailer.createTransport({
      SES: { ses: this.ses, aws: require('@aws-sdk/client-ses') },
} as any);  }


  async sendEmailWithMulterAttachments(
    from: string,
    to: string,
    subject: string,
    templateFilePath: string,
    templateData: any,
    attachments?: Express.Multer.File[],
  ) {
    try {
      const htmlBody = await ejs.renderFile(templateFilePath, templateData); // Render the EJS template

      const formattedAttachments = attachments?.length
        ? attachments.map((file) => ({
          filename: file.originalname,
          content: file.buffer,
          // contentType: mime.lookup(file.originalname) || 'application/octet-stream'
        }))
        : [];

      // Send email
      const info = await this.transporter.sendMail({
        from: from || process.env.AWS_SES_FROM_EMAIL, // sender address
        to, // list of receivers
        subject, // Subject line
        html: htmlBody, // HTML body
        attachments: formattedAttachments, // Attachments array formatted from multer files
      });

      console.log('Email sent successfully:', info);
      return { success: info };
    } catch (error) {
      console.error('Error sending email:', error);
      return { error: error };
    }
  }

  // async uploadFile(file: Express.Multer.File, customDestination: string): Promise<any> {
  //   if (!file || !file?.originalname) {
  //     return { error: 'Invalid file object or missing originalname' };
  //   }

  //   const fileExtension = extname(file.originalname);
  //   console.log("fileExtension ",fileExtension)
  //   file.originalname = `${file.originalname.replace(fileExtension, '')}_${Date.now()}${fileExtension}`;

  //   const headObjectCommand = new HeadObjectCommand({
  //     Bucket: process.env.AWS_S3_BUCKET_NAME,
  //     Key: `${customDestination}/${file.originalname}`,
  //   });

  //   try {
  //     await this.s3.send(headObjectCommand);

  //     // Generate a unique identifier (UUID)
  //     const uniqueIdentifier = uuidv4();

  //     // Remove the leading dot from the extension (if it exists)
  //     // const sanitizedExtension = fileExtension.startsWith('.') ? fileExtension.substring(1) : fileExtension;

  //     // Construct the new file name with the unique identifier
  //     file.originalname = `${file.originalname.replace(fileExtension, '')}_${uniqueIdentifier}${fileExtension}`;
  //   } catch (e) {
  //     // console.log(e)
  //     // If the object doesn't exist, continue with the original objectKey
  //   }

  //   try {
  //     const upload = new Upload({
  //       client: this.s3,
  //       params: {
  //         Bucket: process.env.AWS_S3_BUCKET_NAME,
  //         Key: `${customDestination}/${file.originalname}`,
  //         ACL: 'private',
  //         ContentType: file.mimetype,
  //         Body: file.buffer,
  //       },
  //     });

  //     const result = await upload.done();

  //     return {success: result};
  //   } catch (error) {
  //     // console.log(error)
  //     return {error: error};
  //   }
  // }

  async uploadFile(
    file: Express.Multer.File,
    customDestination: string,
  ): Promise<any> {
    if (!file || !file?.originalname) {
      return { error: 'Invalid file object or missing originalname' };
    }

    const fileExtension = extname(file.originalname);
    console.log('fileExtension ', fileExtension);
    file.originalname = `${file.originalname.replace(
      fileExtension,
      '',
    )}_${Date.now()}${fileExtension}`;

    const headObjectCommand = new HeadObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${customDestination}/${file.originalname}`,
    });

    try {
      await this.s3.send(headObjectCommand);

      // Generate a unique identifier (UUID)
      const uniqueIdentifier = uuidv4();

      // Remove the leading dot from the extension (if it exists)
      // const sanitizedExtension = fileExtension.startsWith('.') ? fileExtension.substring(1) : fileExtension;

      // Construct the new file name with the unique identifier
      file.originalname = `${file.originalname.replace(
        fileExtension,
        '',
      )}_${uniqueIdentifier}${fileExtension}`;
    } catch (e) {
      // console.log(e)
      // If the object doesn't exist, continue with the original objectKey
    }

    try {
      if (file.size < 5 * 1024 * 1024) {
        const upload = new Upload({
          client: this.s3,
          params: {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `${customDestination}/${file.originalname}`,
            ACL: 'private',
            ContentType: file.mimetype,
            Body: file.buffer,
          },
        });
        const result = await upload.done();
        // console.log('file upload result', result);
        return { success: result };
      } else {
        // For larger files, use multipart upload with optimized settings
        const passThroughStream = new PassThrough();
        passThroughStream.end(file.buffer);
        const upload = new Upload({
          client: this.s3,
          params: {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `${customDestination}/${file.originalname}`,
            ACL: 'private',
            ContentType: file.mimetype,
            Body: passThroughStream,
          },
          queueSize: 4, // Increase concurrency for faster uploads
          partSize: 5 * 1024 * 1024, // Set part size to 5MB
        });
        const result = await upload.done();
        // console.log('file upload result', result);
        return { success: result };
      }
    } catch (error) {
      console.log('uploadFile error:', error);
      return { error: error };
    }
  }

  async getPresignedPutUrl(
    key: string,
    contentType = 'application/octet-stream',
    expiresInSec = 300, // 5 minutes
  ): Promise<{ url: string; key: string; expiresIn: number }> {
    const cmd = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ACL: 'private',
    });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: expiresInSec });
    return { url, key, expiresIn: expiresInSec };
  }

  async uploadLocalFile(
    filePath: string,
    customDestination: string,
  ): Promise<{ success?: any; error?: any }> {
    // 1. Read the file off disk
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (err) {
      return { error: `Could not read file at ${filePath}: ${err.message}` };
    }

    // 2. Derive name, extension, and mime type
    const originalname = basename(filePath);           // e.g. "cookies-banner.html"
    const fileExt = extname(originalname);             // e.g. ".html"
    const mimetype = getMimeType(fileExt)              // e.g. "text/html"
      ?? 'application/octet-stream';

    // 3. Build a “fake” Multer file object
    const fakeFile = {
      fieldname: '',
      originalname,
      encoding: '7bit',
      mimetype,
      size: buffer.length,
      destination: '',
      filename: originalname,
      path: filePath,
      buffer,
    } as Express.Multer.File;

    // 4. Delegate to your existing uploadFile() for S3 logic
    try {
      return await this.uploadFile(fakeFile, customDestination);
    } catch (err) {
      // If uploadFile ever throws instead of returning {error:…}, catch here
      return { error: err.message || err };
    }
  }

  // async withoutTimeStampUploadFile(file: Express.Multer.File, customDestination: string): Promise<any> {
  //   if (!file || !file?.originalname) {
  //     return { error: 'Invalid file object or missing originalname' };
  //   }

  //   const fileExtension = extname(file.originalname);
  //   console.log("fileExtension ", fileExtension)

  //   try {
  //     const upload = new Upload({
  //       client: this.s3,
  //       params: {
  //         Bucket: process.env.AWS_S3_BUCKET_NAME,
  //         Key: `${customDestination}/${file.originalname}`,
  //         ACL: 'private',
  //         ContentType: file.mimetype,
  //         Body: file.buffer,
  //       },
  //     });

  //     const result = await upload.done();

  //     return { success: result };
  //   } catch (error) {
  //     // console.log(error);
  //     return { error: error };
  //   }
  // }

  async withoutTimeStampUploadFile(
    file: Express.Multer.File,
    customDestination: string,
  ): Promise<any> {
    if (!file || !file?.originalname) {
      return { error: 'Invalid file object or missing originalname' };
    }

    const fileExtension = extname(file.originalname);
    console.log('fileExtension ', fileExtension);

    try {
      if (file.size < 5 * 1024 * 1024) {
        const upload = new Upload({
          client: this.s3,
          params: {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `${customDestination}/${file.originalname}`,
            ACL: 'private',
            ContentType: file.mimetype,
            Body: file.buffer,
          },
        });
        const result = await upload.done();
        // console.log('file upload result', result);
        return { success: result };
      } else {
        // For larger files, use multipart upload with optimized settings
        const passThroughStream = new PassThrough();
        passThroughStream.end(file.buffer);
        const upload = new Upload({
          client: this.s3,
          params: {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `${customDestination}/${file.originalname}`,
            ACL: 'private',
            ContentType: file.mimetype,
            Body: passThroughStream,
          },
          queueSize: 4, // Increase concurrency for faster uploads
          partSize: 5 * 1024 * 1024, // Set part size to 5MB
        });
        const result = await upload.done();
        // console.log('file upload result', result);
        return { success: result };
      }
    } catch (error) {
      console.log('uploadFile error:', error);
      return { error: error };
    }
  }

  async getPresignedUrl(
    fileDestination: string,
    expiresIn: number,
  ): Promise<any> {
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileDestination,
      });

      const headObjectCommand = new HeadObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileDestination,
      });

      await this.s3.send(headObjectCommand);

      // Use the presigner to generate a presigned URL with a custom expiry time
      const presignedUrl = await getSignedUrl(this.s3, getObjectCommand, {
        expiresIn,
      });

      return { success: presignedUrl, filename: fileDestination };
    } catch (error) {
      // console.log(error)
      return { error: error };
    }
  }

  async deleteFile(filePath: string): Promise<any> {
    try {
      const deleteObjectCommand = new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: filePath,
      });

      const result = await this.s3.send(deleteObjectCommand);
      return { success: result };
    } catch (error) {
      // console.log(error)
      return { error: error };
    }
  }

  // async deleteDirectory(prefix: string): Promise<any> {
  //   try {
  //     const bucketName = process.env.AWS_S3_BUCKET_NAME;
  //     let continuationToken: string | undefined = undefined;
  //     let deletedObjects: string[] = [];

  //     do {
  //       // Step 1: List objects with pagination
  //       const listObjectsCommand = new ListObjectsV2Command({
  //         Bucket: bucketName,
  //         Prefix: prefix,
  //         ContinuationToken: continuationToken,
  //       });

  //       const listedObjects = await this.s3.send(listObjectsCommand);

  //       if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
  //         break;
  //       }

  //       // Step 2: Prepare batch delete
  //       const deleteObjectsCommand = new DeleteObjectsCommand({
  //         Bucket: bucketName,
  //         Delete: {
  //           Objects: listedObjects.Contents.map((item) => ({ Key: item.Key })),
  //         },
  //       });

  //       // Step 3: Execute batch delete
  //       const deleteResult = await this.s3.send(deleteObjectsCommand);
  //       deletedObjects.push(...(deleteResult.Deleted?.map((item) => item.Key!) || []));

  //       // Update continuation token for pagination
  //       continuationToken = listedObjects.NextContinuationToken;

  //     } while (continuationToken);

  //     return { success: true, deletedObjects };
  //   } catch (error) {
  //     return { error: error.message };
  //   }
  // }

  async deleteDirectory(prefix: string): Promise<any> {
    try {
      const bucketName = process.env.AWS_S3_BUCKET_NAME;
      let continuationToken: string | undefined = undefined;
      const batchSize = 1000; // Maximum allowed by S3
      const concurrentDeletes: Promise<any>[] = [];

      do {
        // Step 1: List objects with pagination
        const listObjectsCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listedObjects = await this.s3.send(listObjectsCommand);

        if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
          break;
        }

        // Step 2: Prepare batch delete
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: listedObjects.Contents.map((item) => ({ Key: item.Key! })),
          },
        });

        // Step 3: Push the delete command to concurrent processes
        concurrentDeletes.push(this.s3.send(deleteCommand));

        // Update continuation token for pagination
        continuationToken = listedObjects.NextContinuationToken;

        // Execute in batches to prevent memory overload
        if (concurrentDeletes.length >= batchSize) {
          await Promise.all(concurrentDeletes); // Wait for current batch to finish
          concurrentDeletes.length = 0; // Reset the array
        }

      } while (continuationToken);

      // Step 4: Execute any remaining delete requests
      if (concurrentDeletes.length > 0) {
        await Promise.all(concurrentDeletes);
      }

      return { success: true, message: 'Directory deleted successfully.' };
    } catch (error) {
      return { error: error.message };
    }
  }

}
