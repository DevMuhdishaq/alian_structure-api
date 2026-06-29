import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum AlertFrequency {
  REALTIME = "realtime",
  DAILY_DIGEST = "daily_digest",
}

@Entity("alert_preferences")
export class AlertPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column("simple-array")
  channels: string[]; // 'in-app', 'email', 'websocket', 'push'

  @Column({ type: "int", nullable: true })
  quietHoursStart: number; // 0-23

  @Column({ type: "int", nullable: true })
  quietHoursEnd: number; // 0-23

  @Column({ type: "int", default: 10 })
  rateLimit: number; // max per hour

  @Column({
    type: "enum",
    enum: AlertFrequency,
    default: AlertFrequency.REALTIME,
  })
  frequency: AlertFrequency;

  @Column("simple-array", { nullable: true })
  disabledAlertTypes: string[]; // AlertType values to suppress

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
