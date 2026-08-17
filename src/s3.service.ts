import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Local-disk implementation of file storage, standing in for what was
 * presumably a real AWS S3 service in a fuller version of this platform.
 * That original file wasn't present in what was provided to build this
 * repo's CI/CD pipeline -- this exists so the app actually builds and
 * evidence uploads work, without requiring a new S3 bucket + IAM
 * credentials to be provisioned right now.
 *
 * Interface matches what evidence.service.ts expects: uploadFile() returns
 * an object with Location/Key (evidence.service.ts also checks lowercase
 * location/key as a fallback, which this doesn't need but doesn't break).
 *
 * IMPORTANT: files land under EVIDENCE_UPLOAD_PATH (default ./uploads/evidence)
 * inside the container's filesystem. That path MUST be a mounted Docker
 * volume in production, or every uploaded file is silently lost the next
 * time the container is stopped/recreated (which happens on every deploy).
 * See deploy.yml -- the docker run command mounts a host directory here for
 * exactly that reason. If you ever move this off local disk (e.g. back to
 * real S3, or to EFS), this is the only file that needs to change --
 * nothing in evidence.service.ts references the storage mechanism directly.
 */
@Injectable()
export class S3Service {
  private readonly baseDir =
    process.env.EVIDENCE_UPLOAD_PATH ||
    path.join(process.cwd(), 'uploads', 'evidence');

  async uploadFile(
    file: Express.Multer.File,
    destination: string,
  ): Promise<{
    Location: string;
    Key: string;
    location?: string;
    key?: string;
    success?: {
      Location?: string;
      location?: string;
      Key?: string;
      key?: string;
    };
  }> {
    if (!file?.buffer) {
      throw new Error(
        'S3Service.uploadFile: file.buffer is empty -- Multer must be configured with memoryStorage() for this implementation to work.',
      );
    }

    const targetDir = path.join(this.baseDir, destination);
    fs.mkdirSync(targetDir, { recursive: true });

    // Timestamp-prefixed + sanitized filename to avoid collisions and
    // path traversal from a malicious original filename.
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const targetPath = path.join(targetDir, safeName);

    fs.writeFileSync(targetPath, file.buffer);

    const key = path.posix.join(destination, safeName);

    return {
      // Relative path, not a real URL -- there's no public static file
      // route serving this directory yet. Whatever renders evidence links
      // needs to either prepend the backend's own origin, or a static
      // route needs adding at app.useStaticAssets(baseDir) in main.ts.
      // Flagging rather than silently wiring that up, since exposing
      // uploaded files publicly is a decision worth making deliberately.
      Location: `/uploads/evidence/${key}`,
      Key: key,
    };
  }
}
