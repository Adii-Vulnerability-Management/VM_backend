# Intentionally insecure Terraform for scanner testing only.
# DO NOT run `terraform apply` on this code.

terraform {
  required_version = ">= 1.4.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "public_logs" {
  bucket = "grc-test-public-logs-example-123456"
}

resource "aws_s3_bucket_public_access_block" "public_logs" {
  bucket = aws_s3_bucket.public_logs.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_acl" "public_logs" {
  bucket = aws_s3_bucket.public_logs.id
  acl    = "public-read"
}

resource "aws_security_group" "open_web" {
  name        = "grc-test-open-web"
  description = "Intentionally open security group for scanner testing"

  ingress {
    description = "SSH open to internet - intentionally insecure"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP open to internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "bad_db" {
  identifier             = "grc-test-db"
  engine                 = "mysql"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  username               = "admin"
  password               = "Password123!"
  skip_final_snapshot    = true
  publicly_accessible    = true
  storage_encrypted      = false
  backup_retention_period = 0
}

resource "aws_iam_policy" "admin_policy" {
  name        = "grc-test-admin-policy"
  description = "Intentionally over-permissive policy for scanner testing"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      }
    ]
  })
}
