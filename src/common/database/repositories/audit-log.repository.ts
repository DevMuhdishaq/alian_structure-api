import { Injectable, NotFoundException } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { BaseRepository, FindOptions, BaseEntity } from "./base.repository";
import { AuditLog, LogLevel, AuditAction } from "../entities/audit-log.entity";

export interface CreateAuditLogDto {
  userId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
  level?: LogLevel;
  errorMessage?: string;
  durationMs?: number;
}

@Injectable()
export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor(dataSource: DataSource) {
    super(dataSource, AuditLog);
  }

  async createLog(dto: CreateAuditLogDto): Promise<AuditLog> {
    return this.create({
      ...dto,
      action: dto.action || AuditAction.ACCESS,
      level: dto.level || LogLevel.INFO,
    } as any);
  }

  async findByUserId(
    userId: string,
    options: FindOptions = {},
  ): Promise<AuditLog[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, userId } as any,
    });
  }

  async findByAction(
    action: AuditAction,
    options: FindOptions = {},
  ): Promise<AuditLog[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, action } as any,
    });
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    options: FindOptions = {},
  ): Promise<AuditLog[]> {
    const logs = this.repository;
    const query = this.repository.createQueryBuilder("log");
    query.andWhere("log.createdAt >= :startDate", { startDate });
    query.andWhere("log.createdAt <= :endDate", { endDate });
    if (options.where) {
      Object.entries(options.where).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.andWhere(`log.${key} = :${key}`, { [key]: value });
        }
      });
    }
    if (options.order) {
      Object.entries(options.order).forEach(([field, direction]) => {
        query.orderBy(`log.${field}`, direction);
      });
    }
    if (options.skip) query.skip(options.skip);
    if (options.take) query.take(options.take);
    if (options.relations?.length) {
      options.relations.forEach((relation) => {
        query.leftJoinAndSelect(`log.${relation}`, relation);
      });
    }
    return query.getMany();
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    options: FindOptions = {},
  ): Promise<AuditLog[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, entityType, entityId } as any,
    });
  }

  async findErrorLogs(options: FindOptions = {}): Promise<AuditLog[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, level: LogLevel.ERROR } as any,
    });
  }

  async countByAction(action: AuditAction): Promise<number> {
    return this.count({ action } as any);
  }

  async deleteOldLogs(cutoffDate: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where("createdAt < :cutoffDate", { cutoffDate })
      .execute();
    return result.affected ?? 0;
  }
}
