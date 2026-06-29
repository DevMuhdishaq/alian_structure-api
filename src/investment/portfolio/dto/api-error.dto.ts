import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger representation of the globally standardized error shape
 * returned by GlobalExceptionFilter.
 */
export class ApiErrorDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: "b7f6f7f4-6b12-4bb9-8c7c-1b8d2f2f9a1e" })
  correlationId: string;

  @ApiProperty({
    example: "Request failed",
    oneOf: [{ type: "string" }, { type: "object" }],
  })
  message: string | object;

  @ApiProperty({ example: "2026-06-20T00:00:00.000Z" })
  timestamp: string;

  @ApiProperty({ example: "/api/v1/portfolio/:id" })
  path: string;
}



