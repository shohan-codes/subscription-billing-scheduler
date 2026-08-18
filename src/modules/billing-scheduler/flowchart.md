# Billing Scheduler Endpoint Flowcharts

## Index

- [POST /api/v1/operations/billing-runs](#post-apiv1operationsbilling-runs)
- [GET /api/v1/operations/billing-runs](#get-apiv1operationsbilling-runs)
- [GET /api/v1/operations/billing-runs/:id](#get-apiv1operationsbilling-runsid)
- [GET /api/v1/operations/billing-runs/:id/items](#get-apiv1operationsbilling-runsiditems)

## POST /api/v1/operations/billing-runs

```mermaid
flowchart TD

    subgraph REQUEST["1. Request"]
        direction TB

        START([Start])
        CLIENT["Operator / Bruno"]
        POST["POST /api/v1/operations/billing-runs"]
        GUARD["OperatorGuard"]
        CONTROLLER["BillingSchedulerController.trigger"]

        START --> CLIENT
        CLIENT --> POST
        POST --> GUARD
        GUARD --> CONTROLLER
    end

    subgraph AUTH["2. Authorization"]
        direction TB

        TOKEN{"Bearer token matches configured operator?"}
        AUTH_VALID["VALID"]
        AUTH_INVALID["401 OPERATOR_AUTH_REQUIRED"]

        TOKEN -- Yes --> AUTH_VALID
        TOKEN -- No --> AUTH_INVALID
    end

    GUARD --> TOKEN

    subgraph SERVICE["3. Service Flow"]
        direction TB

        TRIGGER["BillingSchedulerService.triggerManual"]
        COORDINATE["Run shared coordinator path"]

        TRIGGER --> COORDINATE
    end

    AUTH_VALID --> TRIGGER

    subgraph LEASE["4. Coordinator Lease"]
        direction TB

        BUILD["Create fresh owner token and lease request"]
        ACQUIRE["BillingSchedulerRepository.acquireLease"]
        OWNED{"Lease acquired?"}

        BUILD --> ACQUIRE
        ACQUIRE --> OWNED
    end

    COORDINATE --> BUILD

    subgraph SKIPPED["5. Lock Unavailable"]
        direction TB

        SAVE_SKIP["Persist skipped_lock_unavailable attempt"]
        MANUAL_CHECK["validateManualRunOrThrow"]
        CONFLICT["409 SCHEDULER_LEASE_UNAVAILABLE"]

        SAVE_SKIP --> MANUAL_CHECK
        MANUAL_CHECK --> CONFLICT
    end

    OWNED -- No --> SAVE_SKIP

    subgraph RUN["6. Running Attempt"]
        direction TB

        SAVE_RUN["Persist running scheduler_runs row"]
        HEARTBEAT["Start lease and run heartbeat"]
        WORK["Coordinator work boundary"]
        INTERRUPTED{"Lease lost or shutdown started?"}
        COMPLETE["Resolve completed status and counters"]
        INTERRUPT["Finalize interrupted run"]
        RELEASE["Release matching owner lease"]

        SAVE_RUN --> HEARTBEAT
        HEARTBEAT --> WORK
        WORK --> INTERRUPTED
        INTERRUPTED -- No --> COMPLETE
        INTERRUPTED -- Yes --> INTERRUPT
        COMPLETE --> RELEASE
        INTERRUPT --> RELEASE
    end

    OWNED -- Yes --> SAVE_RUN

    subgraph REPOSITORY["7. Repository Operations"]
        direction TB

        LOCK_ROW["Atomic scheduler_locks insert or expired takeover"]
        RUN_ROW["Insert and finalize scheduler_runs row"]
        OWNER_RELEASE["Delete lock only for matching owner token"]
    end

    ACQUIRE --> LOCK_ROW
    SAVE_SKIP --> RUN_ROW
    SAVE_RUN --> RUN_ROW
    COMPLETE --> RUN_ROW
    INTERRUPT --> RUN_ROW
    RELEASE --> OWNER_RELEASE

    subgraph DATABASE["8. PostgreSQL"]
        direction TB

        LOCKS[("scheduler_locks")]
        RUNS[("scheduler_runs")]

        LOCK_ROW --> LOCKS
        OWNER_RELEASE --> LOCKS
        RUN_ROW --> RUNS
    end

    subgraph RESPONSE_MAPPING["9. Response Mapping"]
        direction TB

        RESPONSE_DTO["TriggerBillingRunResponse.from"]
        API_FIELDS["Map scheduler run fields to API fields"]

        RESPONSE_DTO --> API_FIELDS
    end

    RELEASE --> RESPONSE_DTO

    subgraph SUCCESS["10. Success Response"]
        direction TB

        SUCCESS_ENVELOPE["Success response envelope"]
        HTTP_202["202 Accepted"]
        SUCCESS_CLIENT["Operator receives run summary"]

        SUCCESS_ENVELOPE --> HTTP_202
        HTTP_202 --> SUCCESS_CLIENT
    end

    API_FIELDS --> SUCCESS_ENVELOPE

    subgraph ERROR["11. Error Response"]
        direction TB

        FILTER["ApiExceptionFilter"]
        ERROR_ENVELOPE["Build safe error envelope"]
        ERROR_CLIENT["Client receives error"]

        FILTER --> ERROR_ENVELOPE
        ERROR_ENVELOPE --> ERROR_CLIENT
    end

    AUTH_INVALID --> FILTER
    CONFLICT --> FILTER

    SUCCESS_CLIENT --> END_SUCCESS([End])
    ERROR_CLIENT --> END_ERROR([End])
```

## GET /api/v1/operations/billing-runs

```mermaid
flowchart TD

    subgraph REQUEST["1. Request"]
        direction TB

        START([Start])
        CLIENT["Client / Bruno"]
        GET["GET /api/v1/operations/billing-runs"]
        CONTROLLER["BillingSchedulerController.list"]

        START --> CLIENT
        CLIENT --> GET
        GET --> CONTROLLER
    end

    subgraph DTO["2. DTO Field Validation"]
        direction TB

        REQUEST_DTO["ListBillingRunsRequest"]
        TRIGGER_TYPE["triggerType"]
        STATUS["status"]
        CURSOR["cursor"]
        LIMIT["limit"]

        REQUEST_DTO --> TRIGGER_TYPE
        REQUEST_DTO --> STATUS
        REQUEST_DTO --> CURSOR
        REQUEST_DTO --> LIMIT
    end

    CONTROLLER --> REQUEST_DTO

    subgraph TRIGGER_TREE["triggerType"]
        T1{"Optional?"}
        T2{"Allowed trigger type?"}
        T_VALID["VALID"]
        T_INVALID["INVALID"]

        T1 -- Yes --> T_VALID
        T1 -- No --> T2
        T2 -- Yes --> T_VALID
        T2 -- No --> T_INVALID
    end

    TRIGGER_TYPE --> T1

    subgraph STATUS_TREE["status"]
        S1{"Optional?"}
        S2{"Allowed run status?"}
        S_VALID["VALID"]
        S_INVALID["INVALID"]

        S1 -- Yes --> S_VALID
        S1 -- No --> S2
        S2 -- Yes --> S_VALID
        S2 -- No --> S_INVALID
    end

    STATUS --> S1

    subgraph CURSOR_TREE["cursor"]
        C1{"Optional?"}
        C2{"String?"}
        C3{"Length at most 512?"}
        C_VALID["VALID"]
        C_INVALID["INVALID"]

        C1 -- Yes --> C_VALID
        C1 -- No --> C2
        C2 -- No --> C_INVALID
        C2 -- Yes --> C3
        C3 -- Yes --> C_VALID
        C3 -- No --> C_INVALID
    end

    CURSOR --> C1

    subgraph LIMIT_TREE["limit"]
        L1{"Integer?"}
        L2{"Between 1 and 100?"}
        L_VALID["VALID"]
        L_INVALID["INVALID"]

        L1 -- No --> L_INVALID
        L1 -- Yes --> L2
        L2 -- Yes --> L_VALID
        L2 -- No --> L_INVALID
    end

    LIMIT --> L1

    subgraph DTO_RESULT["3. DTO Validation Result"]
        ALL_VALID["All field validations passed"]
        VALIDATION_ERROR["400 VALIDATION_ERROR"]
    end

    T_VALID --> ALL_VALID
    S_VALID --> ALL_VALID
    C_VALID --> ALL_VALID
    L_VALID --> ALL_VALID
    T_INVALID --> VALIDATION_ERROR
    S_INVALID --> VALIDATION_ERROR
    C_INVALID --> VALIDATION_ERROR
    L_INVALID --> VALIDATION_ERROR

    subgraph SERVICE["4. Service Flow"]
        direction TB

        LIST["BillingSchedulerService.listRuns"]
        DECODE["Decode cursor when provided"]
        REPO_CALL["Call listRuns"]
        PAGINATION["Build next cursor and hasMore"]

        LIST --> DECODE
        DECODE --> REPO_CALL
        REPO_CALL --> PAGINATION
    end

    ALL_VALID --> LIST

    subgraph REPOSITORY["5. Repository Operation"]
        direction TB

        REPO["BillingSchedulerRepository.listRuns"]
        FILTERS["Apply trigger and status filters"]
        ORDER["Order by triggered_at DESC then id DESC"]
        LIMIT_QUERY["Fetch limit plus one rows"]

        REPO --> FILTERS
        FILTERS --> ORDER
        ORDER --> LIMIT_QUERY
    end

    REPO_CALL --> REPO

    subgraph DATABASE["6. PostgreSQL"]
        RUNS[("scheduler_runs")]
        ROWS["Return matching run rows"]

        RUNS --> ROWS
    end

    LIMIT_QUERY --> RUNS
    ROWS --> PAGINATION

    subgraph RESPONSE_MAPPING["7. Response Mapping"]
        direction TB

        RESPONSE_DTO["ListBillingRunsResponse.from"]
        API_FIELDS["Map run rows and pagination metadata"]

        RESPONSE_DTO --> API_FIELDS
    end

    PAGINATION --> RESPONSE_DTO

    subgraph SUCCESS["8. Success Response"]
        direction TB

        SUCCESS_ENVELOPE["Success response envelope"]
        HTTP_200["200 OK"]
        SUCCESS_CLIENT["Client receives run page"]

        SUCCESS_ENVELOPE --> HTTP_200
        HTTP_200 --> SUCCESS_CLIENT
    end

    API_FIELDS --> SUCCESS_ENVELOPE

    subgraph ERROR["9. Error Response"]
        direction TB

        FILTER["ApiExceptionFilter"]
        ERROR_CLIENT["Client receives error"]

        FILTER --> ERROR_CLIENT
    end

    VALIDATION_ERROR --> FILTER
    SUCCESS_CLIENT --> END_SUCCESS([End])
    ERROR_CLIENT --> END_ERROR([End])
```

## GET /api/v1/operations/billing-runs/:id

```mermaid
flowchart TD

    subgraph REQUEST["1. Request"]
        direction TB

        START([Start])
        CLIENT["Client / Bruno"]
        GET["GET /api/v1/operations/billing-runs/:id"]
        CONTROLLER["BillingSchedulerController.get"]

        START --> CLIENT
        CLIENT --> GET
        GET --> CONTROLLER
    end

    subgraph DTO["2. DTO Field Validation"]
        REQUEST_DTO["GetBillingRunRequest"]
        ID["id"]
        REQUEST_DTO --> ID
    end

    CONTROLLER --> REQUEST_DTO

    subgraph ID_TREE["id"]
        ID1{"Valid UUID?"}
        ID_VALID["VALID"]
        ID_INVALID["INVALID"]

        ID1 -- Yes --> ID_VALID
        ID1 -- No --> ID_INVALID
    end

    ID --> ID1

    subgraph DTO_RESULT["3. DTO Validation Result"]
        ALL_VALID["All field validations passed"]
        VALIDATION_ERROR["400 VALIDATION_ERROR"]
    end

    ID_VALID --> ALL_VALID
    ID_INVALID --> VALIDATION_ERROR

    subgraph SERVICE["4. Service Flow"]
        GET_RUN["BillingSchedulerService.getRun"]
        REPO_CALL["Call findRunByIdOrThrow"]
        GET_RUN --> REPO_CALL
    end

    ALL_VALID --> GET_RUN

    subgraph REPOSITORY["5. Repository Operation"]
        REPO["BillingSchedulerRepository.findRunByIdOrThrow"]
        FIND["SELECT scheduler run by id"]
        FOUND{"Run found?"}
        NOT_FOUND["404 SCHEDULER_RUN_NOT_FOUND"]

        REPO --> FIND
        FIND --> FOUND
        FOUND -- No --> NOT_FOUND
    end

    REPO_CALL --> REPO

    subgraph DATABASE["6. PostgreSQL"]
        RUNS[("scheduler_runs")]
        RECORD["SchedulerRunRecord"]
        RUNS --> RECORD
    end

    FOUND -- Yes --> RUNS

    subgraph RESPONSE_MAPPING["7. Response Mapping"]
        RESPONSE_DTO["GetBillingRunResponse.from"]
        API_FIELDS["Map run counters timing and status"]
        RESPONSE_DTO --> API_FIELDS
    end

    RECORD --> RESPONSE_DTO

    subgraph SUCCESS["8. Success Response"]
        SUCCESS_ENVELOPE["Success response envelope"]
        HTTP_200["200 OK"]
        SUCCESS_CLIENT["Client receives run"]
        SUCCESS_ENVELOPE --> HTTP_200
        HTTP_200 --> SUCCESS_CLIENT
    end

    API_FIELDS --> SUCCESS_ENVELOPE

    subgraph ERROR["9. Error Response"]
        FILTER["ApiExceptionFilter"]
        ERROR_CLIENT["Client receives error"]
        FILTER --> ERROR_CLIENT
    end

    VALIDATION_ERROR --> FILTER
    NOT_FOUND --> FILTER
    SUCCESS_CLIENT --> END_SUCCESS([End])
    ERROR_CLIENT --> END_ERROR([End])
```

## GET /api/v1/operations/billing-runs/:id/items

```mermaid
flowchart TD

    subgraph REQUEST["1. Request"]
        direction TB

        START([Start])
        CLIENT["Client / Bruno"]
        GET["GET /api/v1/operations/billing-runs/:id/items"]
        CONTROLLER["BillingSchedulerController.items"]

        START --> CLIENT
        CLIENT --> GET
        GET --> CONTROLLER
    end

    subgraph DTO["2. DTO Field Validation"]
        direction TB

        PATH_DTO["GetBillingRunRequest"]
        QUERY_DTO["ListBillingRunItemsRequest"]
        ID["id"]
        RESULT["result"]
        ERROR_CODE["errorCode"]
        CURSOR["cursor"]
        LIMIT["limit"]

        PATH_DTO --> ID
        QUERY_DTO --> RESULT
        QUERY_DTO --> ERROR_CODE
        QUERY_DTO --> CURSOR
        QUERY_DTO --> LIMIT
    end

    CONTROLLER --> PATH_DTO
    CONTROLLER --> QUERY_DTO

    subgraph ID_TREE["id"]
        ID1{"Valid UUID?"}
        ID_VALID["VALID"]
        ID_INVALID["INVALID"]

        ID1 -- Yes --> ID_VALID
        ID1 -- No --> ID_INVALID
    end

    ID --> ID1

    subgraph RESULT_TREE["result"]
        R1{"Optional?"}
        R2{"Allowed run-item result?"}
        R_VALID["VALID"]
        R_INVALID["INVALID"]

        R1 -- Yes --> R_VALID
        R1 -- No --> R2
        R2 -- Yes --> R_VALID
        R2 -- No --> R_INVALID
    end

    RESULT --> R1

    subgraph ERROR_CODE_TREE["errorCode"]
        E1{"Optional?"}
        E2{"String?"}
        E3{"Length at most 80?"}
        E_VALID["VALID"]
        E_INVALID["INVALID"]

        E1 -- Yes --> E_VALID
        E1 -- No --> E2
        E2 -- No --> E_INVALID
        E2 -- Yes --> E3
        E3 -- Yes --> E_VALID
        E3 -- No --> E_INVALID
    end

    ERROR_CODE --> E1

    subgraph CURSOR_TREE["cursor"]
        C1{"Optional?"}
        C2{"String?"}
        C3{"Length at most 512?"}
        C_VALID["VALID"]
        C_INVALID["INVALID"]

        C1 -- Yes --> C_VALID
        C1 -- No --> C2
        C2 -- No --> C_INVALID
        C2 -- Yes --> C3
        C3 -- Yes --> C_VALID
        C3 -- No --> C_INVALID
    end

    CURSOR --> C1

    subgraph LIMIT_TREE["limit"]
        L1{"Integer?"}
        L2{"Between 1 and 100?"}
        L_VALID["VALID"]
        L_INVALID["INVALID"]

        L1 -- No --> L_INVALID
        L1 -- Yes --> L2
        L2 -- Yes --> L_VALID
        L2 -- No --> L_INVALID
    end

    LIMIT --> L1

    subgraph DTO_RESULT["3. DTO Validation Result"]
        ALL_VALID["All field validations passed"]
        VALIDATION_ERROR["400 VALIDATION_ERROR"]
    end

    ID_VALID --> ALL_VALID
    R_VALID --> ALL_VALID
    E_VALID --> ALL_VALID
    C_VALID --> ALL_VALID
    L_VALID --> ALL_VALID
    ID_INVALID --> VALIDATION_ERROR
    R_INVALID --> VALIDATION_ERROR
    E_INVALID --> VALIDATION_ERROR
    C_INVALID --> VALIDATION_ERROR
    L_INVALID --> VALIDATION_ERROR

    subgraph SERVICE["4. Service Flow"]
        ITEMS["BillingSchedulerService.listRunItems"]
        CHECK_RUN["Call findRunByIdOrThrow"]
        DECODE["Decode cursor when provided"]
        LIST_ITEMS["Call listRunItems"]
        PAGINATION["Build next cursor and hasMore"]

        ITEMS --> CHECK_RUN
        CHECK_RUN --> DECODE
        DECODE --> LIST_ITEMS
        LIST_ITEMS --> PAGINATION
    end

    ALL_VALID --> ITEMS

    subgraph REPOSITORY["5. Repository Operation"]
        FIND_RUN["BillingSchedulerRepository.findRunByIdOrThrow"]
        RUN_FOUND{"Run found?"}
        NOT_FOUND["404 SCHEDULER_RUN_NOT_FOUND"]
        REPO_ITEMS["BillingSchedulerRepository.listRunItems"]
        FILTERS["Apply result and errorCode filters"]
        ORDER["Order by started_at DESC then id DESC"]
        LIMIT_QUERY["Fetch limit plus one rows"]

        FIND_RUN --> RUN_FOUND
        RUN_FOUND -- No --> NOT_FOUND
        REPO_ITEMS --> FILTERS
        FILTERS --> ORDER
        ORDER --> LIMIT_QUERY
    end

    CHECK_RUN --> FIND_RUN
    RUN_FOUND -- Yes --> DECODE
    LIST_ITEMS --> REPO_ITEMS

    subgraph DATABASE["6. PostgreSQL"]
        RUNS[("scheduler_runs")]
        RUN_ITEMS[("scheduler_run_items")]
        ITEM_ROWS["Return matching run-item rows"]

        RUNS --> RUN_ITEMS
        RUN_ITEMS --> ITEM_ROWS
    end

    FIND_RUN --> RUNS
    LIMIT_QUERY --> RUN_ITEMS
    ITEM_ROWS --> PAGINATION

    subgraph RESPONSE_MAPPING["7. Response Mapping"]
        RESPONSE_DTO["ListBillingRunItemsResponse.from"]
        API_FIELDS["Map run-item rows and pagination metadata"]
        RESPONSE_DTO --> API_FIELDS
    end

    PAGINATION --> RESPONSE_DTO

    subgraph SUCCESS["8. Success Response"]
        SUCCESS_ENVELOPE["Success response envelope"]
        HTTP_200["200 OK"]
        SUCCESS_CLIENT["Client receives run-item page"]
        SUCCESS_ENVELOPE --> HTTP_200
        HTTP_200 --> SUCCESS_CLIENT
    end

    API_FIELDS --> SUCCESS_ENVELOPE

    subgraph ERROR["9. Error Response"]
        FILTER["ApiExceptionFilter"]
        ERROR_CLIENT["Client receives error"]
        FILTER --> ERROR_CLIENT
    end

    VALIDATION_ERROR --> FILTER
    NOT_FOUND --> FILTER
    SUCCESS_CLIENT --> END_SUCCESS([End])
    ERROR_CLIENT --> END_ERROR([End])
```
