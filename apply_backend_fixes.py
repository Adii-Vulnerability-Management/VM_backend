#!/usr/bin/env python3
"""
Applies the backend CI/CD fixes verified in chat to the real VM_backend repo.
Run this from the VM_backend repo root:

    cd /mnt/c/dev/VM_backend
    python3 apply_backend_fixes.py

Then verify:
    rm -rf node_modules package-lock.json dist
    npm install
    npm run build
    npm run lint

If all three pass clean, commit and push.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path.cwd()


def fail(msg):
    print(f"FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def read(path):
    p = ROOT / path
    if not p.exists():
        fail(f"{path} not found -- are you running this from the VM_backend repo root?")
    return p.read_text(encoding="utf-8")


def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")
    print(f"  wrote {path}")


def replace_once(path, old, new, content=None):
    text = content if content is not None else read(path)
    # tolerate CRLF line endings without changing the file's own convention
    normalized = text.replace("\r\n", "\n")
    if old not in normalized:
        fail(f"{path}: expected text not found (file may have changed since this script was written). Aborting -- no changes written to this file.")
    count = normalized.count(old)
    if count != 1:
        fail(f"{path}: expected exactly 1 match, found {count}. Aborting to avoid an ambiguous edit.")
    return normalized.replace(old, new)


print("1/6: package.json -- removing 22 dead dependencies")
pkg_path = ROOT / "package.json"
if not pkg_path.exists():
    fail("package.json not found")
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
deps = pkg.get("dependencies", {})

to_remove = [
    "@adminjs/mongoose", "@adminjs/typeorm", "adminjs", "typeorm",
    "@nestjs/typeorm", "bullmq", "@nestjs/bullmq", "redis", "ioredis",
    "connect-redis", "@adminjs/bundler", "@adminjs/design-system",
    "@adminjs/express", "@adminjs/koa", "@adminjs/nestjs",
    "@adminjs/relations", "@adminjs/sql", "@adminjs/themes",
    "@adminjs/upload", "qrcode.react", "styled-components",
]
removed = []
for pkgname in to_remove:
    if pkgname in deps:
        del deps[pkgname]
        removed.append(pkgname)
print(f"  removed {len(removed)} packages: {', '.join(removed) if removed else '(none found -- may already be applied)'}")
pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")


print("2/6: src/validation-exception.filter.ts -- drop dead typeorm import/branch")
content = replace_once(
    "src/validation-exception.filter.ts",
    "import { MongoError } from 'mongodb';\nimport { Error as MongooseError } from 'mongoose';\nimport { QueryFailedError } from 'typeorm';\n\n@Catch(MongoError, MongooseError, QueryFailedError, WsException, Error) // Catch both MongoError and MongooseError\nexport class WebSocketExceptionFilter implements WsExceptionFilter {\n  catch(exception: MongoError | MongooseError | QueryFailedError | WsException | Error | BadRequestException, host: ArgumentsHost) {",
    "import { MongoError } from 'mongodb';\nimport { Error as MongooseError } from 'mongoose';\n\n@Catch(MongoError, MongooseError, WsException, Error) // Catch both MongoError and MongooseError\nexport class WebSocketExceptionFilter implements WsExceptionFilter {\n  catch(exception: MongoError | MongooseError | WsException | Error | BadRequestException, host: ArgumentsHost) {",
)
content = replace_once(
    "src/validation-exception.filter.ts",
    "    } else if (exception instanceof QueryFailedError) {\n      status = HttpStatus.INTERNAL_SERVER_ERROR;\n      message = 'Database query failed.';\n    } else if ((exception as BadRequestException) instanceof BadRequestException) {",
    "    } else if ((exception as BadRequestException) instanceof BadRequestException) {",
    content=content,
)
write("src/validation-exception.filter.ts", content)


print("3/6: src/s3.service.ts -- create local-disk evidence storage (was missing entirely)")
s3_service = '''import { Injectable } from '@nestjs/common';
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
    success?: { Location?: string; location?: string; Key?: string; key?: string };
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
'''
write("src/s3.service.ts", s3_service)


print("4/6: src/main.ts -- remove unused apiPrefix parameter")
content = read("src/main.ts")
normalized = content.replace("\r\n", "\n")
if "listenWithFallback(app, port, apiPrefix)" not in normalized:
    fail("src/main.ts: expected listenWithFallback call not found")
normalized = normalized.replace(
    "listenWithFallback(app, port, apiPrefix)",
    "listenWithFallback(app, port)",
)
# Handle both the single-line and multi-line function signature variants
if "async function listenWithFallback(app: NestExpressApplication, port: number, apiPrefix: string) {" in normalized:
    normalized = normalized.replace(
        "async function listenWithFallback(app: NestExpressApplication, port: number, apiPrefix: string) {",
        "async function listenWithFallback(app: NestExpressApplication, port: number) {",
    )
elif "async function listenWithFallback(\n  app: NestExpressApplication,\n  port: number,\n  apiPrefix: string,\n) {" in normalized:
    normalized = normalized.replace(
        "async function listenWithFallback(\n  app: NestExpressApplication,\n  port: number,\n  apiPrefix: string,\n) {",
        "async function listenWithFallback(\n  app: NestExpressApplication,\n  port: number,\n) {",
    )
else:
    fail("src/main.ts: listenWithFallback function signature not found in either expected form")
content = normalized
write("src/main.ts", content)


print("5/6: .eslintrc.js -- honor the existing underscore-prefix unused-var convention")
content = replace_once(
    ".eslintrc.js",
    "  rules: {\n    '@typescript-eslint/interface-name-prefix': 'off',\n    '@typescript-eslint/explicit-function-return-type': 'off',\n    '@typescript-eslint/explicit-module-boundary-types': 'off',\n    '@typescript-eslint/no-explicit-any': 'off',\n  },",
    "  rules: {\n    '@typescript-eslint/interface-name-prefix': 'off',\n    '@typescript-eslint/explicit-function-return-type': 'off',\n    '@typescript-eslint/explicit-module-boundary-types': 'off',\n    '@typescript-eslint/no-explicit-any': 'off',\n    '@typescript-eslint/no-unused-vars': [\n      'error',\n      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },\n    ],\n  },",
)
write(".eslintrc.js", content)


print("6/6: src/validation.pipe.ts -- replace banned Function type with Type<any>")
content = replace_once(
    "src/validation.pipe.ts",
    "import {\n  ArgumentMetadata,\n  BadRequestException,\n  Injectable,\n  PipeTransform,\n} from '@nestjs/common';",
    "import {\n  ArgumentMetadata,\n  BadRequestException,\n  Injectable,\n  PipeTransform,\n  Type,\n} from '@nestjs/common';",
)
content = replace_once(
    "src/validation.pipe.ts",
    "  private toValidate(metatype: Function): boolean {\n    const types: Function[] = [String, Boolean, Number, Array, Object];\n    return !types.includes(metatype);\n  }",
    "  private toValidate(metatype: Type<any>): boolean {\n    const types: Type<any>[] = [String, Boolean, Number, Array, Object];\n    return !types.includes(metatype);\n  }",
    content=content,
)
write("src/validation.pipe.ts", content)


print("7/7: src/auth/auth.service.ts -- remove dead debug code, fix HTML-email bug, remove unused imports")
content = replace_once(
    "src/auth/auth.service.ts",
    "import { Injectable, HttpException, HttpStatus } from '@nestjs/common';",
    "import { Injectable } from '@nestjs/common';",
)
content = replace_once(
    "src/auth/auth.service.ts",
    "    const user = await this.findUserFromJwtPayload(payload);\n    const email = this.normalizeEmail(payload.email || '');\n    // console.log('[AUTH_SERVICE][CHECK_AUTH_DB_USER]', {",
    "    const user = await this.findUserFromJwtPayload(payload);\n    // console.log('[AUTH_SERVICE][CHECK_AUTH_DB_USER]', {",
    content=content,
)
content = replace_once(
    "src/auth/auth.service.ts",
    "      console.log('LOGIN SUCCESS', {\n        email: emailNorm,\n        user_id: refreshedUser?.user_id,\n      });\n      // Correcting the async issue: use await instead of then()\n      const u = await this.mongo\n        .collection('users')\n        .find({ email: 'aditya.p+vlr28@kritikalhire.com' })\n        .toArray();\n\n      // This will log the result after the query has resolved\n      // console.log(\n      //   'userrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',\n      //   JSON.stringify(u, null, 2),\n      // );\n      return {\n        statusCode: 200,\n        body: {\n          message: 'You have Logged-in Successfully',",
    "      console.log('LOGIN SUCCESS', {\n        email: emailNorm,\n        user_id: refreshedUser?.user_id,\n      });\n\n      return {\n        statusCode: 200,\n        body: {\n          message: 'You have Logged-in Successfully',",
    content=content,
)
content = replace_once(
    "src/auth/auth.service.ts",
    "    const cmd = new SendEmailCommand({\n      Source: from,\n      Destination: { ToAddresses: [to] },\n      Message: {\n        Subject: { Data: subject, Charset: 'UTF-8' },\n        Body: {\n          Text: { Data: text, Charset: 'UTF-8' },\n        },\n      },\n    });",
    "    const cmd = new SendEmailCommand({\n      Source: from,\n      Destination: { ToAddresses: [to] },\n      Message: {\n        Subject: { Data: subject, Charset: 'UTF-8' },\n        Body: {\n          Text: { Data: text, Charset: 'UTF-8' },\n          ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),\n        },\n      },\n    });",
    content=content,
)
write("src/auth/auth.service.ts", content)


print("8/8: src/access/access.controller.ts -- remove unused UseGuards/PermissionsGuard imports")
content = replace_once(
    "src/access/access.controller.ts",
    "  Req,\n  UseGuards,\n} from '@nestjs/common';\nimport { RbacService } from './rbac.service';\nimport { PermissionsGuard } from '../auth/guards/permissions.guard';\n\nimport { AssignAccessDto } from './dto/assign-access.dto';",
    "  Req,\n} from '@nestjs/common';\nimport { RbacService } from './rbac.service';\n\nimport { AssignAccessDto } from './dto/assign-access.dto';",
)
write("src/access/access.controller.ts", content)

print()
print("All edits applied. Now run:")
print("  rm -rf node_modules package-lock.json dist")
print("  npm install")
print("  npm run build")
print("  npm run lint")
print("All three should complete with no errors.")
