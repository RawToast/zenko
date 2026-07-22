import { fileURLToPath } from "url"

const resourcePath = (filename: string) =>
  fileURLToPath(new URL(`./resources/${filename}`, import.meta.url))

export const additionalPropertiesYamlPath = resourcePath(
  "additional-properties.yaml"
)
export const anyOfCombinationsYamlPath = resourcePath("anyof-combinations.yaml")
export const authApiYamlPath = resourcePath("auth-api.yaml")
export const blockscoutYamlPath = resourcePath("blockscout.yaml")
export const complexCompositionYamlPath = resourcePath(
  "complex-composition.yaml"
)
export const dateEnumYamlPath = resourcePath("date-enum.yaml")
export const dateTimeOffsetYamlPath = resourcePath("datetime-offset.yaml")
export const enumDemoYamlPath = resourcePath("enum-demo.yaml")
export const fireblocksV2YamlPath = resourcePath("fireblocks-v2.yaml")
export const formDataYamlPath = resourcePath("form-data.yaml")
export const inlineResponseArrayYamlPath = resourcePath(
  "inline-response-array.yaml"
)
export const mixedHeadersYamlPath = resourcePath("mixed-headers.yaml")
export const nullableAllOfErrorsYamlPath = resourcePath(
  "nullable-allof-errors.yaml"
)
export const noResponseContentYamlPath = resourcePath(
  "no-response-content.yaml"
)
export const nonJsonResponsesYamlPath = resourcePath("non-json-responses.yaml")
export const oneOfDiscriminatorYamlPath = resourcePath(
  "oneof-discriminator.yaml"
)
export const optionalHeadersYamlPath = resourcePath("optional-headers.yaml")
export const petstoreYamlPath = resourcePath("petstore.yaml")
export const propertyMetadataYamlPath = resourcePath("property-metadata.yaml")
export const stringFormatsYamlPath = resourcePath("string-formats.yaml")
export const tictactoeYamlPath = resourcePath("tictactoe.yaml")
export const trainTravelYamlPath = resourcePath("train-travel.yaml")
export const webhookExampleYamlPath = resourcePath("webhook-example.yaml")
