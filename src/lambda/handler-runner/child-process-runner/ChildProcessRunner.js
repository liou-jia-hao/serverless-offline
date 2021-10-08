import path from 'path'
import { node } from 'execa'
import { log, legacy } from '../../../serverlessLog.js'

const childProcessHelperPath = path.resolve(__dirname, 'childProcessHelper.js')

export default class ChildProcessRunner {
  #env = null
  #functionKey = null
  #handlerName = null
  #handlerPath = null
  #timeout = null
  #allowCache = false

  constructor(funOptions, env, allowCache) {
    const { functionKey, handlerName, handlerPath, timeout } = funOptions

    this.#env = env
    this.#functionKey = functionKey
    this.#handlerName = handlerName
    this.#handlerPath = handlerPath
    this.#timeout = timeout
    this.#allowCache = allowCache
  }

  // no-op
  // () => void
  cleanup() {}

  async run(event, context) {
    const childProcess = node(
      childProcessHelperPath,
      [this.#functionKey, this.#handlerName, this.#handlerPath],
      {
        env: this.#env,
        stdio: 'inherit',
      },
    )

    const message = new Promise((resolve, reject) => {
      childProcess.on('message', (data) => {
        if (data.error) reject(data.error)
        else resolve(data)
      })
    }).finally(() => {
      childProcess.kill()
    })

    childProcess.send({
      context,
      event,
      allowCache: this.#allowCache,
      timeout: this.#timeout,
    })

    let result

    try {
      result = await message
    } catch (err) {
      // TODO
      legacy.consoleLog(err)
      log.error(err)

      throw err
    }

    return result
  }
}
