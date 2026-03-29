import type { z } from "zod"

import type {
  OperationDefinition,
  OperationErrors,
  RequestMethod,
  SecurityRequirement,
} from "./types"
import type { AnyHeaderFn } from "./types"
import type { TreatyResult } from "./treaty-types"

type AnyOperationDefinition = OperationDefinition<
  RequestMethod,
  (...args: any[]) => string,
  unknown,
  unknown,
  AnyHeaderFn | undefined,
  OperationErrors | undefined,
  readonly SecurityRequirement[] | undefined
>

type TreatyMethodOptions = RequestInit & {
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

type InferZodOutput<Schema> = Schema extends z.ZodType
  ? z.infer<Schema>
  : unknown

type InferZodInput<Schema> = Schema extends z.ZodType
  ? z.input<Schema>
  : unknown

type SuccessData<Op extends AnyOperationDefinition> =
  NonNullable<Op["response"]> extends z.ZodType
    ? InferZodOutput<NonNullable<Op["response"]>>
    : unknown

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
      ? (params: ParamRecord<K>) => TreatyClient<R[K]>
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
    ? TreatyClient<R[K]>
    : never
}

/**
 * Inferred Eden-style client for a nested `treatyRoutes` object whose leaves are
 * {@link OperationDefinition} values (Zod-typed `request` / `response`).
 */
export type TreatyClient<R> = LeafMethods<R> &
  StaticSegmentChildren<R> &
  DynamicBranch<R>

/** Permissive input constraint for `createTreatyClient` — inference comes from `routes`. */
export type TreatyRoutesConstraint = Record<string, unknown>
