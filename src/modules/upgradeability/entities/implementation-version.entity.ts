import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("implementation_versions")
@Index(["moduleKey", "version"], { unique: true })
export class ImplementationVersion {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 128 })
  moduleKey: string;

  @Column({ type: "varchar", length: 64 })
  version: string;

  /** SHA-256 or equivalent content hash of the deployed artefact. */
  @Column({ type: "varchar", length: 128 })
  checksum: string;

  /** URI or path where the implementation artefact is stored. */
  @Column({ type: "varchar", length: 1024 })
  artifactUri: string;

  /** Semver range of compatible core versions. */
  @Column({ type: "varchar", length: 255, nullable: true })
  coreCompatibilityRange: string | null;

  /** Free-text release notes supplied by the deployer. */
  @Column({ type: "text", nullable: true })
  releaseNotes: string | null;

  /** Whether this version is the currently active implementation. */
  @Column({ type: "boolean", default: false })
  active: boolean;

  @CreateDateColumn()
  registeredAt: Date;
}
