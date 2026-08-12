variable "aws_region" {
  description = "AWS region for provider configuration. Only needed if someone initializes Terraform; do not apply this test code."
  type        = string
  default     = "ap-south-1"
}
