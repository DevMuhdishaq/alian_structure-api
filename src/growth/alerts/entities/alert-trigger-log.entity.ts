import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { AlertType } from "./alert.entity";

@Entity("alert_trigger_logs")
export class AlertTriggerLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  alertId: string;

  @Column()
  userId: string;

  @Column({ type: "enum", enum: AlertType, nullable: true })
  type?: AlertType;

  @Column({ type: "jsonb", nullable: true })
  payload?: Record<string, unknown>;

  @CreateDateColumn()
  triggeredAt: Date;
}
