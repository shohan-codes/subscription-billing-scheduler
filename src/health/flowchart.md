# Health Endpoint Flowcharts

## Index

- [GET /health/live](#get-healthlive)
- [GET /health/ready](#get-healthready)

## GET /health/live

Reports process liveness without checking PostgreSQL or other dependencies.

```mermaid
flowchart TD

    subgraph REQUEST["1. Request"]
        direction TB

        START([Start])
        CLIENT["Client / Load Balancer"]
        GET["GET /health/live"]
        CONTROLLER["HealthController.live"]

        START --> CLIENT
        CLIENT --> GET
        GET --> CONTROLLER
    end

    subgraph HEALTH["2. Liveness Check"]
        direction TB

        BUILD["Return status = ok"]
        NO_DEPENDENCY["No database or external dependency check"]

        BUILD --> NO_DEPENDENCY
    end

    CONTROLLER --> BUILD

    subgraph SUCCESS["3. Success Response"]
        direction TB

        BODY["{ status: ok }"]
        HTTP_200["200 OK"]
        SUCCESS_CLIENT["Client receives liveness result"]

        BODY --> HTTP_200
        HTTP_200 --> SUCCESS_CLIENT
    end

    NO_DEPENDENCY --> BODY
    SUCCESS_CLIENT --> END([End])
```

## GET /health/ready

Reports readiness by executing a minimal PostgreSQL connectivity query.

```mermaid
flowchart TD

    subgraph REQUEST["1. Request"]
        direction TB

        START([Start])
        CLIENT["Client / Load Balancer"]
        GET["GET /health/ready"]
        CONTROLLER["HealthController.ready"]

        START --> CLIENT
        CLIENT --> GET
        GET --> CONTROLLER
    end

    subgraph READINESS["2. Readiness Check"]
        direction TB

        QUERY["Execute SELECT 1 through Kysely"]
        RESULT{"Database query succeeds?"}
        READY["Build status = ok and database = up"]
        UNAVAILABLE["503 DATABASE_UNAVAILABLE"]

        RESULT -- Yes --> READY
        RESULT -- No --> UNAVAILABLE
    end

    CONTROLLER --> QUERY

    subgraph DATABASE["3. PostgreSQL"]
        direction TB

        DB[("PostgreSQL")]
        CONNECTION["Execute SELECT 1"]

        DB --> CONNECTION
    end

    QUERY --> DB
    CONNECTION --> RESULT

    subgraph SUCCESS["4. Success Response"]
        direction TB

        BODY["{ status: ok, checks: { database: up } }"]
        HTTP_200["200 OK"]
        SUCCESS_CLIENT["Client receives readiness result"]

        BODY --> HTTP_200
        HTTP_200 --> SUCCESS_CLIENT
    end

    READY --> BODY

    subgraph ERROR_FLOW["5. Error Response"]
        direction TB

        ERROR_HANDLER["ApiExceptionFilter"]
        ERROR_ENVELOPE["Build safe error response"]
        ERROR_CLIENT["Client receives readiness error"]

        ERROR_HANDLER --> ERROR_ENVELOPE
        ERROR_ENVELOPE --> ERROR_CLIENT
    end

    UNAVAILABLE --> ERROR_HANDLER

    SUCCESS_CLIENT --> END_SUCCESS([End])
    ERROR_CLIENT --> END_ERROR([End])
```
