import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Cell {
    value: Value;
    name: string;
}
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export type Result = {
    __kind__: "ok";
    ok: RunRecordView;
} | {
    __kind__: "err";
    err: RunRecordError;
};
export type Result_1 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: RunRecordError;
};
export type Result_2 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export type RunId = string;
export type RunRecordError = {
    __kind__: "alreadyExists";
    alreadyExists: RunId;
} | {
    __kind__: "invalidInput";
    invalidInput: string;
} | {
    __kind__: "notAuthenticated";
    notAuthenticated: null;
} | {
    __kind__: "notFound";
    notFound: RunId;
};
export interface RunRecordView {
    inputHash: string;
    calculatorVersion: string;
    outputsJson: string;
    createdAt: Timestamp;
    propertyId: string;
    inputProvenanceJson: string;
    runId: RunId;
    effectiveInputsJson: string;
}
export interface SaveRunRecordInput {
    inputHash: string;
    calculatorVersion: string;
    outputsJson: string;
    propertyId: string;
    inputProvenanceJson: string;
    runId: RunId;
    effectiveInputsJson: string;
}
export type Timestamp = bigint;
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    /**
     * / Delete one of the caller's run records by id.
     */
    deleteRunRecord(runId: RunId): Promise<Result_1>;
    execute(qJson: string): Promise<Result__1>;
    /**
     * / Static Markdown description of this canister's public API, authored from
     * / the current backend source. Reads no state.
     */
    getApiDoc(): Promise<string>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Fetch one of the caller's run records by id.
     */
    getRunRecord(runId: RunId): Promise<RunRecordView | null>;
    isCallerAdmin(): Promise<boolean>;
    /**
     * / List the caller's saved run records, newest first.
     */
    listRunRecords(): Promise<Array<RunRecordView>>;
    /**
     * / Save a snapshot run record for the signed-in caller.
     */
    saveRunRecord(input: SaveRunRecordInput): Promise<Result>;
    schema(): Promise<string>;
}
