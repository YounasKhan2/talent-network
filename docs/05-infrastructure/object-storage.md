# Object Storage Architecture

## Purpose

Talent Network stores resumes, attachments, exports, generated reports, and other large binary artifacts in private object storage rather than PostgreSQL.

The application depends on an **S3-compatible storage contract**, not a RustFS-specific API.

## Local Development Provider

Local development uses **RustFS** in Docker Compose.

Current local topology:

```text
Application / AWS S3 SDK
        ↓
S3-compatible configuration
        ↓
http://localhost:9000
        ↓
RustFS
        ↓
rustfs_data Docker volume
```

The management console is exposed locally on port `9001`.

RustFS is intentionally treated as replaceable infrastructure. Product/domain packages must not import RustFS-specific SDKs or model RustFS-specific concepts.

## Local Browser CORS Bootstrap

Direct browser uploads use presigned S3 URLs, so the object-storage endpoint must explicitly allow the web application's origin. Local development keeps this policy in `infrastructure/rustfs/cors.local.json` and applies it with the one-shot `rustfs-bootstrap` Compose service after RustFS becomes healthy.

The local policy is intentionally narrow:

- allowed origin: `http://localhost:3000`
- allowed methods: `GET`, `HEAD`, `PUT`
- request headers are allowed because SigV4 presigned requests can include signed S3 headers
- `ETag` is exposed for upload/client interoperability
- no public bucket access is granted

CORS is a browser transport policy, not an authorization mechanism. Candidate ownership and signed-URL authorization remain server-side requirements.

The bootstrap service creates the local bucket only when it does not already exist and then applies the CORS policy through the standard S3 API. This keeps the application storage adapter provider-neutral and makes local browser-upload behavior reproducible after `docker compose up -d`.

Production deployments must provision an equivalent CORS policy for their actual web origins through infrastructure/deployment configuration. Production origins must not be replaced with an unrestricted wildcard merely to make browser uploads work.

## Why RustFS Locally

RustFS provides the S3-compatible primitives required by the MVP while remaining self-hostable for development.

The local container is pinned to a specific release candidate rather than `latest` so development environments do not change unexpectedly.

RustFS runs as UID/GID `10001:10001`. The repository therefore includes a short-lived `rustfs-permissions` Compose service that initializes the named data volume with the required ownership before RustFS starts.

## Application Contract

Application storage code should consume configuration through the generic S3 variables:

```text
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
S3_FORCE_PATH_STYLE
```

This configuration must remain provider-neutral.

The storage adapter should use a mature S3-compatible client such as the AWS SDK for JavaScript rather than a RustFS-specific SDK.

## Required MVP Operations

The storage abstraction must support at least:

- create presigned upload URL
- create presigned download URL
- object metadata / HEAD
- delete object
- multipart upload when required
- controlled object copy/move semantics where useful
- private bucket access

Business modules should work with application-level file identifiers and storage keys rather than vendor response objects.

## Security Requirements

All candidate resumes and private employer/candidate attachments are private by default.

Requirements:

- no permanently public resume bucket
- short-lived signed URLs
- server-authorized access before issuing signed URLs
- randomized/non-guessable object keys
- content-type and size validation
- malware scanning before a file becomes trusted/usable
- tenant/candidate ownership metadata in PostgreSQL
- audit sensitive downloads/exports when appropriate
- do not expose storage credentials to browsers

Browser uploads use presigned URLs so large files do not proxy through the API application.

## Source of Truth

PostgreSQL stores authoritative file metadata and ownership.

Object storage stores bytes.

```text
PostgreSQL
- file identity
- owner
- tenant/candidate relationship
- storage key
- MIME type
- size
- checksum
- processing state
- version references

Object Storage
- binary object bytes
```

An object existing in storage does not by itself authorize access to it.

## Bucket Lifecycle

For local development, `S3_BUCKET=talent-network-local` is the intended bucket name.

The one-shot local `rustfs-bootstrap` service ensures that bucket exists and applies browser CORS. This is development infrastructure setup, not application business logic.

Production bucket creation must be managed through deployment/infrastructure provisioning rather than implicit runtime side effects from normal API requests.

## Production Provider Policy

RustFS is the local-development default, not a permanent production lock-in.

Production selection will be based on measured requirements such as:

- durability
- backup/replication
- availability
- regional requirements
- egress cost
- operational burden
- security/compliance capabilities
- S3 compatibility for the subset we actually use

Potential production targets can include managed S3-compatible services, AWS S3, Cloudflare R2, or a validated RustFS deployment.

Changing provider should primarily be configuration/infrastructure work, not a rewrite of resume or application business logic.

## Compatibility Discipline

Only depend on the S3 feature subset covered by automated storage-adapter integration tests.

When a new S3 operation is introduced:

1. add it to the internal storage interface
2. test it against the local RustFS environment
3. ensure the operation is available on intended production providers
4. document any compatibility constraint

This prevents accidental dependency on provider-specific behavior.
