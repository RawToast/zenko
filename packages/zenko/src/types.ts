export type PathFn<TArgs extends unknown[] = []> = (...args: TArgs) => string

export type RequestMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace"

export type HeaderFn<
  TArgs extends unknown[] = [],
  TResult = Record<string, unknown> | Record<string, never>,
> = (...args: TArgs) => TResult

export type OperationErrors<
  TClient = unknown,
  TServer = unknown,
  TDefault = unknown,
  TOther = unknown,
> = {
  clientErrors?: TClient
  serverErrors?: TServer
  defaultErrors?: TDefault
  otherErrors?: TOther
}
type ValuesOf<T> = T extends object ? T[keyof T] : never

export type OperationError<T> =
  T extends OperationErrors<infer TClient, infer TServer, infer TDefault, infer TOther>
    ? ValuesOf<TClient> | ValuesOf<TServer> | ValuesOf<TDefault> | ValuesOf<TOther>
    : T extends {
        clientErrors?: infer TClient
        serverErrors?: infer TServer
        defaultErrors?: infer TDefault
        otherErrors?: infer TOther
      }
    ? ValuesOf<TClient> | ValuesOf<TServer> | ValuesOf<TDefault> | ValuesOf<TOther>
    : never

export type OperationDefinition<
  TMethod extends RequestMethod,
  TPath extends (...args: any[]) => string,
  TRequest = undefined,
  TResponse = undefined,
  THeaders extends HeaderFn | undefined = undefined,
  TErrors extends OperationErrors | undefined = undefined,
> = {
  method: TMethod
  path: TPath
  request?: TRequest
  response?: TResponse
  headers?: THeaders
  errors?: TErrors
}
