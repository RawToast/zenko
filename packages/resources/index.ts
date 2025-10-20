import * as fs from "fs"

const readOpenApiSpec = (path: string) => {
  const content = fs.readFileSync(`specs/${path}`, "utf8")
  return content
}

const inlineResponseArray = readOpenApiSpec("inline-response-array.yaml")
const mixedHeaders = readOpenApiSpec("mixed-headers.yaml")
const noResponseContent = readOpenApiSpec("no-response-content.yaml")
const optionalHeaders = readOpenApiSpec("optional-headers.yaml")
const petstore = readOpenApiSpec("petstore.yaml")
const stringFormats = readOpenApiSpec("string-formats.yaml")
const tictactoe = readOpenApiSpec("tictactoe.yaml")
const trainTravel = readOpenApiSpec("train-travel.yaml")
const webhookExample = readOpenApiSpec("webhook-example.yaml")

// const strictSpec = readOpenApiSpec("strict-spec.yaml")

export {
  inlineResponseArray,
  mixedHeaders,
  noResponseContent,
  optionalHeaders,
  petstore,
  stringFormats,
  tictactoe,
  trainTravel,
  webhookExample,
  // strictSpec,
}
