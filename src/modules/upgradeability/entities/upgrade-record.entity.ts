import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum UpgradeStatus {
  PENDING = "pending",
  MIGRATING = "migrating",
  COMPLETED = "completed",
  FAILED = "failed",
  ROLLED_BACK = "rolled_back",
}

@Entity("upgrade_records")
@Index(["moduleKey", "fromVersion", "toVersion"], { unique: true })
export class UpgradeRecord {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * Logical module or service identifier being upgraded (e.g. "oracle-service",
   * "module-registry", "api-core").  This is NOT the registry module UUID —
   * it is a free-form key that the operator supplies when planning an upgrade.
   */
  @Column({ type: "varchar", length: 128 })
  moduleKey: string;

  @Column({ type: "varchar", length: 64 })
  fromVersion: string;

  @Column({ type: "varchar", length: 64 })
  toVersion: string;

  @Column({
    type: "varchar",
    length: 32,
    enum: UpgradeStatus,
    default: UpgradeStatus.PENDING,
  })
  status: UpgradeStatus;

  /** Summary supplied by the operator describing the upgrade motivation. */
  @Column({ type: "text", nullable: true })
  description: string | null;

  /** JSON-serialised checklist items that must be satisfied before execution. */
  @Column({
    type: process.env.NODE_ENV === "test" ? "simple-json" : "jsonb",
    nullable: true,
  })
  checklist: Record<string, unknown> | null;

  /** JSON-serialised pre-flight check results produced during plan(). */
  @Column({
    type: process.env.NODE_ENV === "test" ? "simple-json" : "jsonb",
    nullable: true,
  })
  preflightResults: Record<string, unknown> | null;

  /** The admin principal that authorised the upgrade. */
  @Column({ type: "varchar", length: 255, nullable: true })
  authorisedBy: string | null;

  /** Timestamp when the upgrade was executed (entered MIGRATING). */
  @Column({ type: process.env.NODE_ENV === "test" ? "datetime" : "timestamp", nullable: true })
  startedAt: Date | null;

  /** Timestamp when the upgrade reached a terminal status. */
  @Column({ type: process.env.NODE_ENV === "test" ? "datetime" : "timestamp", nullable: true })
  completedAt: Date | null;

  /** Error message when status is FAILED or ROLLED_BACK. */
  @Column({ type: "text", nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
