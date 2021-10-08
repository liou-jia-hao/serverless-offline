import serverlessLog, { log, legacy } from '../../../serverlessLog.js'

export default class InvocationsController {
  #lambda = null

  constructor(lambda) {
    this.#lambda = lambda
  }

  async invoke(functionName, invocationType, event, clientContext) {
    // Reject gracefully if functionName does not exist
    const functionNames = this.#lambda.listFunctionNames()
    if (functionNames.length === 0 || !functionNames.includes(functionName)) {
      serverlessLog(
        `Attempt to invoke function '${functionName}' failed. Function does not exists.`,
      )
      log.error(
        `Attempt to invoke function '${functionName}' failed. Function does not exists.`,
      )
      // Conforms to the actual response from AWS Lambda when invoking a non-existent
      // function. Details on the error are provided in the Payload.Message key
      return {
        FunctionError: 'ResourceNotFoundException',
        Payload: {
          Message: `Function not found: ${functionName}`,
          Type: 'User',
        },
        StatusCode: 404,
      }
    }

    const lambdaFunction = this.#lambda.getByFunctionName(functionName)

    lambdaFunction.setClientContext(clientContext)
    lambdaFunction.setEvent(event)

    if (invocationType === 'Event') {
      // don't await result!
      lambdaFunction.runHandler().catch((err) => {
        // TODO handle error
        legacy.consoleLog(err)
        log.error(err)
        throw err
      })

      return {
        Payload: '',
        StatusCode: 202,
      }
    }

    if (!invocationType || invocationType === 'RequestResponse') {
      let result

      try {
        result = await lambdaFunction.runHandler()
      } catch (err) {
        serverlessLog(
          `Unhandled Lambda Error during invoke of '${functionName}'`,
        )
        log.error(
          `Unhandled Lambda Error during invoke of '${functionName}': ${err}`,
        )
        legacy.consoleLog(err)
        // In most circumstances this is the correct error type/structure.
        // The API returns a StreamingBody with status code of 200
        // that eventually spits out the error and stack trace.
        // When the request is synchronous, aws-sdk should buffer
        // the whole error stream, however this has not been validated.
        return {
          Payload: {
            errorType: 'Error',
            errorMessage: err.message,
            trace: err.stack.split('\n'),
          },
          UnhandledError: true,
          StatusCode: 200,
        }
        // TODO: Additional pre and post-handler validation can expose
        // the following error types:
        // RequestTooLargeException, InvalidParameterValueException,
        // and whatever response is thrown when the response is too large.
      }

      // Checking if the result of the Lambda Invoke is a primitive string to wrap it. this is for future post-processing such as Step Functions Tasks
      if (result) {
        if (typeof result === 'string') {
          result = `"${result}"`
        }
      }

      // result is actually the Payload.
      // So return in a standard structure so Hapi can
      // respond with the correct status codes
      return {
        Payload: result,
        StatusCode: 200,
      }
    }

    // TODO FIXME
    const errMsg = `invocationType: '${invocationType}' not supported by serverless-offline`
    legacy.consoleLog(errMsg)
    log.error(errMsg)

    return {
      FunctionError: 'InvalidParameterValueException',
      Payload: {
        Message: errMsg,
        Type: 'User',
      },
      StatusCode: 400,
    }
  }
}
