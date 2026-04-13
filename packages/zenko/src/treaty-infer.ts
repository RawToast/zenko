import type { z } from "zod"

import type {
  OperationDefinition,
  OperationErrors,
  RequestMethod,
  SecurityRequirement,
} from "./types"
import type { AnyHeaderFn } from "./types"
import type {
  TreatyHttpError,
  TreatyResult,
  TreatySuccess,
} from "./treaty-types"

export type AnyOperationDefinition = OperationDefinition<
  RequestMethod,
  (...args: any[]) => string,
  unknown,
  unknown,
  AnyHeaderFn | undefined,
  OperationErrors | undefined,
  readonly SecurityRequirement[] | undefined
>

/**
 * Single argument per call. `params` / `query` are partials of the generated
 * `paths.*` input object (path + query fields); they are merged when building the URL.
 */
export type TreatyRequest<
  TPathArg = Record<string, unknown>,
  TBody = unknown,
> = {
  params?: Partial<TPathArg>
  query?: Partial<TPathArg>
  /** JSON-serializable body, or raw `FormData` / `Blob` for multipart uploads. */
  body?: TBody | FormData | Blob
  headers?: Record<string, string>
  init?: Omit<RequestInit, "method" | "body" | "headers">
}

type InferZod<Schema> = Schema extends z.ZodType ? z.output<Schema> : unknown

type InferZodInput<Schema> = Schema extends z.ZodType
  ? z.input<Schema>
  : unknown

type SuccessData<Op extends AnyOperationDefinition> =
  NonNullable<Op["response"]> extends z.ZodType
    ? InferZod<NonNullable<Op["response"]>>
    : unknown

type ErrorsRecord<Op extends AnyOperationDefinition> =
  Op["errors"] extends Record<string, z.ZodType>
    ? Op["errors"]
    : Record<string, never>

/** Per-operation entry in generated `operationMetadata`. */
export type TreatyOperationMeta = {
  method: string
  path: string
  successResponses?: Record<string, string>
  errorResponses?: Record<string, string>
  errorStatusKeys?: Record<string, string>
}

type ValueUnion<T> = T[keyof T]

/** OpenAPI response key → `specStatus` field (numeric status, `"default"`, or `"unlisted"`). */
type ResponseKeyToSpec<K extends PropertyKey> = K extends "default"
  ? "default"
  : K extends number
    ? K
    : K extends `${infer N extends number}`
      ? N
      : never

type SuccessBranches<
  Op extends AnyOperationDefinition,
  Meta extends TreatyOperationMeta,
> = Meta extends { successResponses: infer M }
  ? M extends Record<string, string>
    ? ValueUnion<{
        [K in keyof M]: K extends string | number
          ? ResponseKeyToSpec<K> extends infer S
            ? [S] extends [never]
              ? never
              : S extends number
                ? TreatySuccess<S, SuccessData<Op>>
                : never
            : never
          : never
      }>
    : TreatySuccess<number, SuccessData<Op>>
  : TreatySuccess<number, SuccessData<Op>>

type HttpBranches<
  Op extends AnyOperationDefinition,
  Meta extends TreatyOperationMeta,
> = Meta extends { errorResponses: infer ER }
  ? ER extends Record<string, string>
    ? Meta extends { errorStatusKeys: infer KS }
      ? KS extends Record<string, string>
        ? ValueUnion<{
            [C in keyof ER]: C extends string | number
              ? ResponseKeyToSpec<C> extends infer Spec
                ? Spec extends string | number
                  ? C extends keyof KS
                    ? KS[C] extends keyof ErrorsRecord<Op>
                      ? TreatyHttpError<Spec, InferZod<ErrorsRecord<Op>[KS[C]]>>
                      : TreatyHttpError<Spec, unknown>
                    : TreatyHttpError<Spec, unknown>
                  : never
                : never
              : never
          }>
        : ValueUnion<{
            [C in keyof ER]: C extends string | number
              ? ResponseKeyToSpec<C> extends infer Spec
                ? Spec extends string | number
                  ? TreatyHttpError<Spec, unknown>
                  : never
                : never
              : never
          }>
      : ValueUnion<{
          [C in keyof ER]: C extends string | number
            ? ResponseKeyToSpec<C> extends infer Spec
              ? Spec extends string | number
                ? TreatyHttpError<Spec, unknown>
                : never
              : never
            : never
        }>
    : never
  : never

export type TreatyResultFor<
  Op extends AnyOperationDefinition,
  Meta extends TreatyOperationMeta = TreatyOperationMeta,
> =
  | SuccessBranches<Op, Meta>
  | HttpBranches<Op, Meta>
  | {
      kind: "http"
      specStatus: "unlisted"
      status: number
      error: unknown
      response: Response
      headers: Headers
    }
  | { kind: "transport"; error: Error }
  | {
      kind: "parse"
      status: number
      error: Error
      rawBody: string
      response: Response
      headers: Headers
    }
  | { kind: "unknown"; error: unknown }

type PathArg<Op extends AnyOperationDefinition> =
  Parameters<Op["path"]> extends []
    ? Record<string, never>
    : Parameters<Op["path"]> extends [infer P]
      ? P extends Record<string, unknown>
        ? P
        : Record<string, unknown>
      : Record<string, unknown>

type OperationCall<
  Op extends AnyOperationDefinition,
  Meta extends TreatyOperationMeta,
> = Op["method"] extends "get" | "head"
  ? (req?: TreatyRequest<PathArg<Op>>) => Promise<TreatyResultFor<Op, Meta>>
  : NonNullable<Op["request"]> extends z.ZodType
    ? (
        req: TreatyRequest<
          PathArg<Op>,
          InferZodInput<NonNullable<Op["request"]>>
        >
      ) => Promise<TreatyResultFor<Op, Meta>>
    : (
        req?: TreatyRequest<PathArg<Op>, unknown>
      ) => Promise<TreatyResultFor<Op, Meta>>

export type TreatyOperationsClient<
  T extends Record<string, AnyOperationDefinition>,
  TMeta extends Record<keyof T & string, TreatyOperationMeta>,
> = {
  [K in keyof T]: OperationCall<
    T[K],
    K extends keyof TMeta ? TMeta[K] : TreatyOperationMeta
  >
}

type TreatyMethodOptions = RequestInit & {
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

/**
 * Structural check: `Op["method"] extends "get" | "head"` is wrong when `method` is
 * typed as `RequestMethod` (union) — it would match the GET branch incorrectly.
 */
export type LeafCall<Op extends AnyOperationDefinition> = Op extends {
  method: "get" | "head"
}
  ? (opts?: {
      query?: Record<string, unknown>
      headers?: Record<string, string>
    }) => Promise<TreatyResult<SuccessData<Op>>>
  : Op extends { request: infer Req }
    ? Req extends z.ZodType
      ? (
          body: InferZodInput<Req>,
          init?: TreatyMethodOptions
        ) => Promise<TreatyResult<SuccessData<Op>>>
      : (
          body?: unknown,
          init?: TreatyMethodOptions
        ) => Promise<TreatyResult<SuccessData<Op>>>
    : (
        body?: unknown,
        init?: TreatyMethodOptions
      ) => Promise<TreatyResult<SuccessData<Op>>>

type LeafMethods<R> = {
  [K in keyof R as K extends symbol
    ? never
    : R[K] extends AnyOperationDefinition
      ? K
      : never]: R[K] extends AnyOperationDefinition ? LeafCall<R[K]> : never
}

type DynamicParamKey<R> = Extract<keyof R, `:${string}`>

type ParamRecord<K extends `:${string}`> = K extends `:${infer Name}`
  ? { [P in Name]: string | number }
  : never

type DynamicBranch<R> = [DynamicParamKey<R>] extends [never]
  ? unknown
  : DynamicParamKey<R> extends infer K extends `:${string}`
    ? K extends keyof R
      ? (params: ParamRecord<K>) => TreatyRouteTreeClient<R[K]>
      : never
    : unknown

type StaticSegmentChildren<R> = {
  [K in keyof R as K extends symbol
    ? never
    : K extends `:${string}`
      ? never
      : R[K] extends AnyOperationDefinition
        ? never
        : R[K] extends Record<string, unknown>
          ? K
          : never]: R[K] extends Record<string, unknown>
    ? TreatyRouteTreeClient<R[K]>
    : never
}

/**
 * Inferred client for a nested `treatyRoutes` object (secondary / `$routes` API).
 */
export type TreatyRouteTreeClient<R> = LeafMethods<R> &
  StaticSegmentChildren<R> &
  DynamicBranch<R>

/**
 * @deprecated Route-tree shape; prefer {@link TreatyOperationsClient}.
 */
export type TreatyClient<R> = TreatyRouteTreeClient<R>

export type TreatyRoutesConstraint = Record<string, unknown>
