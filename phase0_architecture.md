# Phase 0 — Architecture & Service Boundaries

> No code. Pure architecture. Read this carefully before writing a single line.

---

## 1. Final Architecture Diagram

```
                          ┌─────────────────────────────────────────────────────────┐
                          │                      CLIENTS                            │
                          │          (Web App / Mobile App / CLI / Tests)           │
                          └──────────────────────────┬──────────────────────────────┘
                                                     │ HTTPS
                                                     ▼
                          ┌──────────────────────────────────────────────────────────┐
                          │                    API GATEWAY                           │
                          │          :3000  (NestJS HTTP + Microservice Client)      │
                          │                                                          │
                          │  • Route requests to services                           │
                          │  • Auth token validation (JWT verify only)              │
                          │  • Rate limiting                                         │
                          │  • Request/correlation ID injection                      │
                          │  • No business logic                                     │
                          └────┬──────────┬──────────┬──────────┬───────────────────┘
                               │          │          │          │
                      TCP/gRPC │          │          │          │
               ┌───────────────▼─┐  ┌────▼────┐ ┌──▼──────┐ ┌─▼──────────┐
               │   Auth Service  │  │  User   │ │ Product │ │   Order    │
               │     :3001       │  │ Service │ │ Service │ │  Service   │
               │                 │  │  :3002  │ │  :3003  │ │   :3004    │
               │ • Issue JWT     │  │         │ │         │ │            │
               │ • Refresh token │  │ • CRUD  │ │ • CRUD  │ │ • Create   │
               │ • Validate JWT  │  │   users │ │products │ │   orders   │
               │ • Revoke token  │  │ • Profile│ │ • Price │ │ • Order    │
               │                 │  │         │ │ • Stock │ │   lifecycle│
               └────────┬────────┘  └────┬────┘ └──┬──────┘ └──┬─────────┘
                        │                │          │            │
                        ▼                ▼          ▼            │
               ┌────────────────┐  ┌─────────┐ ┌──────────┐    │
               │   auth_db      │  │ user_db │ │product_db│    │
               │  (PostgreSQL)  │  │(Postgres)│ │(Postgres)│    │
               └────────────────┘  └─────────┘ └──────────┘    │
                                                                 │ Publish Event
                                                                 ▼
                          ┌──────────────────────────────────────────────────┐
                          │                   RabbitMQ                       │
                          │                                                  │
                          │  Exchanges:                                      │
                          │    order.exchange   (direct/topic)               │
                          │    payment.exchange (direct/topic)               │
                          │    inventory.exchange (direct/topic)             │
                          │    notification.exchange (fanout)                │
                          │                                                  │
                          │  Queues:                                         │
                          │    order.created        payment.queue            │
                          │    payment.succeeded    inventory.queue          │
                          │    payment.failed       notification.queue       │
                          │    inventory.reserved   dlq.*                    │
                          │    inventory.failed                              │
                          └──────┬──────────────────────┬───────────────────┘
                                 │                      │
                   ┌─────────────▼──────┐   ┌──────────▼──────────┐
                   │   Payment Service  │   │  Inventory Service   │
                   │      :3005         │   │       :3006          │
                   │                    │   │                      │
                   │ • Charge card      │   │ • Reserve stock      │
                   │ • Refund           │   │ • Release stock      │
                   │ • Payment events   │   │ • Inventory events   │
                   └─────────┬──────────┘   └──────────┬───────────┘
                             │                         │
                   ┌─────────▼──────────┐   ┌──────────▼───────────┐
                   │    payment_db      │   │    inventory_db       │
                   │   (PostgreSQL)     │   │    (PostgreSQL)       │
                   └────────────────────┘   └──────────────────────┘
                                                        │
                                       ┌────────────────▼──────────────────┐
                                       │        Notification Service        │
                                       │             :3007                   │
                                       │                                     │
                                       │ • Email (SMTP)                      │
                                       │ • SMS (stub)                        │
                                       │ • In-app (stub)                     │
                                       │ • No DB (stateless)                 │
                                       └─────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────────────────

                         SHARED INFRASTRUCTURE

    ┌───────────────┐   ┌──────────────────┐   ┌────────────────────────┐
    │     Redis      │   │   Prometheus      │   │   Grafana              │
    │                │   │   + OTel          │   │   Dashboards           │
    │ • Auth token   │   │   Collector       │   │                        │
    │   revocation   │   │                  │   │ • Request rates         │
    │ • Idempotency  │   │ • Metrics scrape  │   │ • Error rates           │
    │   keys         │   │ • Trace ingest    │   │ • Latency histograms    │
    │ • Rate limit   │   │                  │   │ • Queue depths          │
    │   counters     │   │                  │   │ • DB pool utilization   │
    │ • Dist locks   │   │                  │   │                        │
    └───────────────┘   └──────────────────┘   └────────────────────────┘
```

---

## 2. Service Responsibilities

Each service has ONE clearly defined domain. It does not reach into another service's domain.

| Service | Port | Responsibility | Owns |
|---|---|---|---|
| **API Gateway** | 3000 | Route, authenticate (JWT verify), rate-limit, inject correlation IDs | Nothing — no DB |
| **Auth Service** | 3001 | Issue/refresh/revoke JWTs, manage refresh tokens, bcrypt passwords | `auth_db` |
| **User Service** | 3002 | User profiles, preferences, address book | `user_db` |
| **Product Service** | 3003 | Product catalog, pricing, categories | `product_db` |
| **Order Service** | 3004 | Order lifecycle (created → confirmed → shipped → delivered), order line items | `order_db` |
| **Inventory Service** | 3006 | Stock levels, reservations, releases | `inventory_db` |
| **Payment Service** | 3005 | Charge processing, refunds, payment records | `payment_db` |
| **Notification Service** | 3007 | Email/SMS delivery, notification templates | **No database** — stateless |

### Critical Rule: API Gateway has NO business logic

The Gateway only:
- Validates JWT signatures (not business rules)
- Proxies requests to downstream services
- Handles cross-cutting: rate limiting, correlation IDs, request logging

It never:
- Makes business decisions
- Calls multiple services and merges results for business purposes
- Holds state

---

## 3. Database Ownership

This is the foundational rule of microservices data isolation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE OWNERSHIP MAP                              │
│                                                                             │
│  auth_db       ── owned exclusively by ──▶  Auth Service                   │
│  user_db       ── owned exclusively by ──▶  User Service                   │
│  product_db    ── owned exclusively by ──▶  Product Service                │
│  order_db      ── owned exclusively by ──▶  Order Service                  │
│  inventory_db  ── owned exclusively by ──▶  Inventory Service              │
│  payment_db    ── owned exclusively by ──▶  Payment Service                │
│                                                                             │
│  ✅ A service reads its own DB directly via Prisma                          │
│  ✅ A service calls ANOTHER service's API to read that service's data       │
│  ❌ A service NEVER connects to another service's DB                        │
│  ❌ No shared DB schemas between services                                   │
│  ❌ No cross-service foreign keys in the database                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why this matters

In a monolith, a JOIN across users and orders is trivial. In microservices, it is **not allowed**. If Order Service needs a user's email, it must call User Service's API — or store a local copy of only what it needs (denormalization is acceptable and sometimes required).

This forces you to be explicit about data contracts and dependencies.

---

## 4. Communication Matrix

Two patterns are used. Knowing **when to use which** is the core skill.

### Synchronous (Request/Response via TCP NestJS transport)

Used when: the caller **needs an immediate answer** to proceed.

| From | To | Pattern | Why Synchronous |
|---|---|---|---|
| API Gateway | Auth Service | `send()` → `@MessagePattern` | Gateway must validate token before routing |
| API Gateway | User Service | `send()` → `@MessagePattern` | CRUD response needed immediately |
| API Gateway | Product Service | `send()` → `@MessagePattern` | Product data needed for response |
| API Gateway | Order Service | `send()` → `@MessagePattern` | Order creation initiates the async saga |
| Order Service | Inventory Service | `send()` (within saga) | Reserve stock must succeed before payment |

### Asynchronous (Events via RabbitMQ)

Used when: the caller **does not need to wait** for the result, or the work is a **side effect**.

| Publisher | Event | Consumers | Why Asynchronous |
|---|---|---|---|
| Order Service | `order.created` | Payment Service, Notification Service | Payment and notification are side effects |
| Payment Service | `payment.succeeded` | Order Service, Inventory Service, Notification Service | Multiple consumers, fire-and-forget |
| Payment Service | `payment.failed` | Order Service, Inventory Service, Notification Service | Compensating action, no need to block |
| Inventory Service | `inventory.reserved` | Order Service | Stock reservation confirmed |
| Inventory Service | `inventory.failed` | Order Service | Cannot reserve → cancel order |
| Order Service | `order.confirmed` | Notification Service | Inform customer |
| Order Service | `order.cancelled` | Notification Service | Inform customer |

---

## 5. Important Commands (Domain Operations)

Commands are **intentions** — they request that something happen.

```
CreateOrder          → Order Service
CancelOrder          → Order Service
RegisterUser         → Auth + User Service (coordinated at gateway)
LoginUser            → Auth Service
RefreshToken         → Auth Service
UpdateProfile        → User Service
AddProduct           → Product Service
UpdateProductPrice   → Product Service
ReserveInventory     → Inventory Service
ReleaseInventory     → Inventory Service
ProcessPayment       → Payment Service
RefundPayment        → Payment Service
SendNotification     → Notification Service
```

---

## 6. Important Events (Domain Facts)

Events are **facts** — something already happened. They are immutable records.

```
UserRegistered
UserProfileUpdated
OrderCreated
OrderConfirmed
OrderCancelled
OrderShipped
OrderDelivered
InventoryReserved
InventoryReservationFailed
InventoryReleased
PaymentRequested
PaymentSucceeded
PaymentFailed
PaymentRefunded
NotificationSent
NotificationFailed
```

### Naming convention

- Commands: imperative verb → `CreateOrder`
- Events: past tense → `OrderCreated`
- This distinction matters because events are broadcasts of fact, not requests.

---

## 7. The Checkout Flow (The Core Saga)

This is the most important flow in the system. Every phase builds toward this.

### Happy Path

```
1.  Client          →  POST /orders                         (API Gateway)
2.  API Gateway     →  validates JWT                        (Auth Service, sync)
3.  API Gateway     →  forwards CreateOrder command         (Order Service, sync)
4.  Order Service   →  creates order (status: PENDING)      (order_db)
5.  Order Service   →  publishes OrderCreated               (RabbitMQ)
6.  Order Service   →  returns orderId to API Gateway       (sync response)
7.  API Gateway     →  returns 202 Accepted to client
─── Async from here ────────────────────────────────────────────────────
8.  Inventory Svc   →  consumes OrderCreated
9.  Inventory Svc   →  reserves stock                       (inventory_db)
10. Inventory Svc   →  publishes InventoryReserved          (RabbitMQ)
11. Payment Svc     →  consumes InventoryReserved
12. Payment Svc     →  charges card                         (payment_db)
13. Payment Svc     →  publishes PaymentSucceeded           (RabbitMQ)
14. Order Svc       →  consumes PaymentSucceeded
15. Order Svc       →  updates order (status: CONFIRMED)    (order_db)
16. Order Svc       →  publishes OrderConfirmed             (RabbitMQ)
17. Notification    →  consumes OrderConfirmed
18. Notification    →  sends email to customer
```

### Failure Path — Payment Failed

```
1-10. Same as happy path
11. Payment Svc     →  consumes InventoryReserved
12. Payment Svc     →  card declined                        (payment_db)
13. Payment Svc     →  publishes PaymentFailed              (RabbitMQ)
14. Inventory Svc   →  consumes PaymentFailed
15. Inventory Svc   →  releases reserved stock              (inventory_db → compensating tx)
16. Inventory Svc   →  publishes InventoryReleased
17. Order Svc       →  consumes PaymentFailed
18. Order Svc       →  updates order (status: CANCELLED)    (order_db → compensating tx)
19. Order Svc       →  publishes OrderCancelled
20. Notification    →  consumes OrderCancelled
21. Notification    →  sends failure email to customer
```

> **Key insight**: There is no 2-phase commit here. Each service does its own local transaction and publishes a compensating event if something goes wrong. This is **eventual consistency via choreography**.

---

## 8. Failure Scenarios (What the system must survive)

These are not edge cases — they are expected production realities.

| Scenario | What happens | How the system handles it |
|---|---|---|
| Order Service crashes after publishing `OrderCreated` | Message is in RabbitMQ queue | Consumer reads it when Order Service recovers |
| Payment Service crashes mid-charge | Payment may be in unknown state | Idempotency key prevents double charge on retry |
| Notification Service is down | Email not sent | Message sits in queue; NS retries on startup |
| Duplicate `OrderCreated` event delivered | Consumer runs twice | Idempotency check: skip if already processed |
| Inventory reservation succeeds, payment service unreachable | Inventory reserved but payment never tried | Timeout → PaymentFailed → compensating release |
| API Gateway → User Service timeout | Gateway receives timeout error | Return 503 to client with retry hint |
| PostgreSQL primary goes down | Service DB calls fail | Graceful degradation, circuit breaker trips |
| RabbitMQ goes down | Events cannot be published | Outbox pattern (Phase 6): store events in DB first |
| Message stuck in retry loop forever | Consumer keeps failing | Dead-letter queue (DLQ): move to DLQ after N retries |
| Redis goes down | Cache misses | Services fall back to DB reads; rate limiting degrades gracefully |

---

## 9. Production Requirements (Per Phase Baseline)

Every service, from Phase 1, must have these. They are not optional.

```
Configuration
  ├── All config from environment variables
  ├── Joi/Zod schema validation on startup
  └── Fail fast if required env vars are missing

Security
  ├── No secrets in code or Docker images
  ├── No logging of passwords, tokens, or PII
  ├── JWT validation at gateway (not in services)
  └── Service-to-service: trusted network (mTLS in Kubernetes phase)

Observability
  ├── Structured JSON logs via Pino (not console.log)
  ├── Correlation ID on every request and log line
  ├── Health check endpoint: GET /health (liveness)
  ├── Readiness check endpoint: GET /health/ready (readiness)
  └── Prometheus metrics endpoint: GET /metrics

Database
  ├── Prisma migrations (never prisma db push in production)
  ├── Proper indexes on frequently queried fields
  ├── Connection pooling configured
  └── No raw SQL unless Prisma cannot express it

Resilience
  ├── Graceful shutdown: drain in-flight requests on SIGTERM
  ├── Timeout on all outgoing calls
  ├── Retry only idempotent operations
  └── Dead-letter queues for failed messages

Testing
  ├── Unit tests for domain logic (Jest)
  ├── Integration tests for DB interactions
  └── Consumer contract tests for message shapes

Code Quality
  ├── TypeScript strict mode
  ├── ESLint + Prettier enforced in CI
  └── No any unless unavoidable with comment explaining why
```

---

## 10. Complete Phase Roadmap

```
PHASE 0  — Architecture & Boundaries             ← YOU ARE HERE
           No code. Understand the system.

PHASE 1  — Repository Foundation
           Monorepo · Gateway · User Service · Docker
           Postgres · Prisma · Health checks · Logging · Testing

PHASE 2  — Synchronous Communication
           TCP transport · ClientProxy · send() · @MessagePattern()
           Timeouts · Error propagation · Gateway → User Service

PHASE 3  — Database Ownership
           User DB · Product Service + DB · Order Service + DB
           Migrations · Indexes · Transactions · Pagination

PHASE 4  — Async Messaging with RabbitMQ
           Producer · Consumer · Exchange · Queue · Binding · ACK
           OrderCreated → Notification Service

PHASE 5  — Event-Driven Architecture
           Commands vs Events · PaymentRequested → PaymentSucceeded/Failed
           Multi-consumer patterns · Event contracts

PHASE 6  — Reliability
           Timeout · Retry · Backoff · DLQ · Idempotency
           Duplicate handling · Circuit breaker · Outbox pattern

PHASE 7  — Distributed Transactions (Saga)
           Inventory Service · Full checkout saga
           Choreography · Compensating transactions · Eventual consistency

PHASE 8  — Redis
           Caching · Idempotency store · Distributed locks · Rate limiting

PHASE 9  — Observability
           OpenTelemetry · Distributed tracing · Prometheus · Grafana
           Trace: Client → Gateway → Order → RabbitMQ → Payment → DB

PHASE 10 — Testing
           Unit · Integration · Consumer contract · E2E
           Failure scenario tests

PHASE 11 — Production Review
           Security · Performance · Scalability audit
           Find and discuss problems — you decide what to fix

PHASE 12 — Kafka
           Topics · Partitions · Offsets · Consumer groups
           Kafka vs RabbitMQ — real comparison using our system

PHASE 13 — Kubernetes (Optional)
           Pods · Deployments · Services · ConfigMaps · Secrets
           Readiness/liveness · HPA · Rolling deployments
```

---

## Mental Model Check — Before Phase 1

Before we write any code, you should be able to answer these:

1. If the Notification Service is down, does the checkout flow block? Why or why not?
2. If Order Service needs to display a user's email on an order — but User Service owns `user_db` — how does Order Service get that data?
3. Why does the API Gateway validate JWTs but NOT enforce business authorization rules?
4. What is the difference between a Command and an Event? Give an example of each from our system.
5. Why is `payment.succeeded` an event and not a response to a command?
6. What does "idempotency" mean in the context of the payment charge operation?
7. Why do we use `202 Accepted` instead of `200 OK` for order creation?

---

> **Phase 0 complete.** When you are ready to begin building, say **"Start Phase 1"** and we will set up the production-grade monorepo foundation.
