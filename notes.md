export type CloseMerchantOperation = OperationDefinition<
  typeof paths.closeMerchant,
  typeof Reason,
  undefined,
  typeof headers.closeMerchant,
  OperationErrors<typeof MerchantErrorResponse, typeof MerchantErrorResponse, unknown, unknown>
>;