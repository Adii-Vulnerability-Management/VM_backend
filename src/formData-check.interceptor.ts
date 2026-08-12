
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, BadRequestException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class DynamicFileInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    const multipleFiles = request.files as Express.Multer.File[];
    const singleFiles = request.file as Express.Multer.File;

    return next.handle();
  }
}

@Injectable()
export class FormDataCheckInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();

    // console.log("req.file ", req.file)
    // console.log("req.files ", req.files)

    if (!req.is('multipart/form-data')) {
      throw new BadRequestException('Payload must be in form-data format.');
    }

    return next.handle();
  }
}

@Injectable()
export class TPRMVendorManagementScheduleAttachmentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    if (request.files) {
      const files = request.files as Express.Multer.File[];
      const structuredAttachments = [];

      // Organize files into an array of objects
      files.forEach((file) => {
        // Parse the fieldname to extract indices
        const match = file.fieldname.match(/scheduleCommentAndAttachments\[(\d+)]\[scheduleCommentAttachmentFiles]\[(\d+)]/);
        if (match) {
          const [_, commentIndex] = match.map(Number);

          // Ensure the array contains an object for the current index
          if (!structuredAttachments[commentIndex]) {
            structuredAttachments[commentIndex] = {
              scheduleCommentAttachmentFiles: [],
            };
          }

          // Add the file to the appropriate object
          structuredAttachments[commentIndex].scheduleCommentAttachmentFiles.push(file);
        }
      });

      // Assign the structured array to `scheduleCommentAttachmentFiles`
      request.files = structuredAttachments.filter(Boolean); // Filter out any undefined entries
    }

    return next.handle();
  }
}


@Injectable()
export class CreateControlExcelFormDataCheckInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();

    if (!req.is('multipart/form-data')) {
      throw new BadRequestException('Payload must be in form-data format.');
    }

    if (!req.file || !req.file?.fieldname || !req.file?.originalname) {
      throw new BadRequestException('Please Upload Excel File.');
    }

    return next.handle();
  }
}


@Injectable()
export class TisaxFormDataCheckInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();

    if (!req.is('multipart/form-data')) {
      throw new BadRequestException('Payload must be in form-data format.');
    }

    if (!req.file || !req.file?.fieldname || !req.file?.originalname) {
      throw new BadRequestException('Please Upload Signature File.');
    }

    return next.handle();
  }
}