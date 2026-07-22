import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "./base.entity";

export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export enum AuditAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LOGIN = "login",
  LOGOUT = "logout",
  ACCESS = "access",
  EXPORT = "export",
  PERMISSION_CHANGE = "permission_change",
}

@Entity("audit_logs")
@Index(["userId", "createdAt"])
@Index(["action", "createdAt"])
export class AuditLog extends BaseEntity {
  @Column({ type: "uuid", nullable: true })
  @Index()
  userId: string;

  @Column({ type: "varchar", length: 50 })
  @Index()
  action: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  resourceType: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  resourceId: string;

  @Column({ type: "text", nullable: true })
  details: string;

  @Column({ type: "varchar", length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: "text", nullable: true })
  userAgent: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  entityId: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  entityType: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, unknown>;

  @Column({ type: "varchar", length: 50, default: LogLevel.INFO })
  level: LogLevel;

  @Column({ type: "text", nullable: true })
  errorMessage: string;

  @Column({ type: "integer", nullable: true })
  durationMs: number;
}
