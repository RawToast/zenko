export type PathFn<TArgs extends unknown[] = []> = (...args: TArgs) => string

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
  clientErrors?: Record<string, TClient>
  serverErrors?: Record<string, TServer>
  defaultErrors?: Record<string, TDefault>
  otherErrors?: Record<string, TOther>
}

export type OperationDefinition<
  TPath extends (...args: any[]) => string,
  TRequest = undefined,
  TResponse = undefined,
  THeaders extends HeaderFn | undefined = undefined,
  TErrors extends OperationErrors | undefined = undefined,
> = {
  path: TPath
  request?: TRequest
  response?: TResponse
  headers?: THeaders
  errors?: TErrors
}
