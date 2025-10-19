# Train Travel API Issues

This document outlines the issues discovered when generating TypeScript types from the `train-travel.yaml` OpenAPI specification using Zenko.

## Overview

The `train-travel.yaml` spec is a modern, complex OpenAPI 3.1.0 specification that exposes several issues in the Zenko generator when handling hyphenated names and response type generation.

## Test Setup

- **Test File**: `packages/zenko/src/__tests__/train-travel.test.ts`
- **Generated Output**: `packages/examples/src/schema/train-travel.gen.ts`
- **Snapshot**: `packages/zenko/src/__tests__/__snapshots__/train-travel.test.ts.snap`

## Issues Identified

### 1. Invalid TypeScript Identifiers with Hyphens

**Problem**: Schema names containing hyphens generate invalid TypeScript identifiers.

**Examples from generated output**:

```typescript
// ❌ Invalid TypeScript - hyphens not allowed in identifiers
export const Links-Self = z.object({...})
export const Links-Destination = z.object({...})
export const Links-Origin = z.object({...})
export const Links-Pagination = z.object({...})
export const Wrapper-Collection = z.object({...})
export const Links-Booking = z.object({...})
```

**Expected output**:

```typescript
// ✅ Valid TypeScript - camelCase conversion
export const LinksSelf = z.object({...})
export const LinksDestination = z.object({...})
export const LinksOrigin = z.object({...})
export const LinksPagination = z.object({...})
export const WrapperCollection = z.object({...})
export const LinksBooking = z.object({...})
```

**Affected schemas from the spec**:

- `Links-Self` (line 762 in YAML)
- `Links-Destination` (line 769 in YAML)
- `Links-Origin` (line 776 in YAML)
- `Links-Pagination` (line 783 in YAML)
- `Wrapper-Collection` (line 908 in YAML)
- `Links-Booking` (line 1053 in YAML)

### 2. Missing Response Type Definitions

**Problem**: Response types are referenced in operation definitions but never generated.

**Examples from generated output**:

```typescript
// ❌ These types are referenced but never defined
export type GetStationsOperation = OperationDefinition<
  "get",
  typeof paths.getStations,
  undefined,
  Get-stationsResponse200,  // ❌ Missing definition
  // ...
>;

export type GetTripsOperation = OperationDefinition<
  "get",
  typeof paths.getTrips,
  undefined,
  Get-tripsResponse200,     // ❌ Missing definition
  // ...
>;
```

**Missing response types**:

- `Get-stationsResponse200`
- `Get-tripsResponse200`
- `Get-bookingsResponse200`
- `Create-bookingResponse201`
- `Get-bookingResponse200`
- `Create-booking-paymentResponse200`

### 3. Missing Webhook Support

**Problem**: Webhooks defined in the spec are not processed or generated.

**From the spec** (line 649):

```yaml
webhooks:
  newBooking:
    post:
      operationId: new-booking
      summary: New Booking
      # ... webhook definition
```

**Expected**: Should generate a `newBooking` operation or separate webhook handling.

### 4. Operation ID Hyphen Handling

**Problem**: While operation IDs with hyphens are converted to camelCase for function names, the response type naming still uses hyphens.

**Current behavior**:

```typescript
// ✅ Function names are correctly converted
export const getStations: GetStationsOperation = {...}
export const getTrips: GetTripsOperation = {...}

// ❌ But response types still have hyphens
Get-stationsResponse200  // Should be GetStationsResponse200
Get-tripsResponse200     // Should be GetTripsResponse200
```

## Root Cause Analysis

### Schema Name Processing

The generator needs to implement proper identifier sanitization for schema names, converting hyphens to camelCase following TypeScript conventions.

### Response Type Generation

The generator creates operation types that reference response types, but fails to generate the actual response type definitions. This suggests a gap in the response schema processing pipeline.

### Webhook Processing

The current generator appears to only process `paths` and ignores the `webhooks` section of OpenAPI specs.

## Impact

These issues result in:

- **TypeScript compilation errors** due to invalid identifiers
- **Missing type definitions** causing undefined type references
- **Incomplete API coverage** when webhooks are ignored
- **Poor developer experience** with broken generated code

## Fix Priority

1. **High**: Fix schema name hyphen handling (breaks compilation)
2. **High**: Generate missing response type definitions (breaks compilation)
3. **Medium**: Implement webhook support (feature completeness)
4. **Low**: Consistent hyphen handling in response type naming (code quality)

## Test Cases

The test suite `train-travel.test.ts` includes specific assertions for:

- Schema name validation
- Response type presence
- Operation ID handling
- Webhook processing

These tests will serve as regression guards once the issues are fixed.

## Related Files

- `packages/zenko/src/resources/train-travel.yaml` - Source OpenAPI spec
- `packages/zenko/src/__tests__/train-travel.test.ts` - Test suite
- `packages/examples/src/schema/train-travel.gen.ts` - Generated output with issues
- `packages/examples/generate.js` - Updated to generate train-travel schema
