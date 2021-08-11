/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function;
  staticRenderFns: Array<Function>;
};

// 创建一个函数
function createFunction (code, errors) {
  // 尝试使用 code 创建一个函数，如果有异常，将异常添加进 errors 数组，返回一个空函数
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err, code })
    return noop
  }
}

export function createCompileToFunctionFn (compile: Function): Function {
  const cache = Object.create(null)

  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    // 对 options 做一个浅拷贝，并确保 options 是一个对象
    options = extend({}, options)
    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      // 如果不是生产环境，尝试使用 new Function 去创建函数，看会不会抛出异常
      try {
        new Function('return 1')
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
    }

    // check cache
    // 设置一个缓存的 key 值
    // 如果 options 中传入了 分隔符，则 key 值为 将分隔符转为字符串之后和模版做拼接，否则是模版；例如 '<App />'
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template

    // 查看是否已经被缓存了，如果被缓存了，直接返回
    // 由于编译比较耗时，所以相同的 组件，只做一次编译
    if (cache[key]) {
      return cache[key]
    }

    // compile
    // 核心
    // 获取 baseCompile 编译后的值
    const compiled = compile(template, options)

    // check compilation errors/tips
    // 非生产环境
    if (process.env.NODE_ENV !== 'production') {
      // 遍历 errors 和 tips
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
              generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
            compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
            vm
          )
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    const res = {}
    const fnGenErrors = []
    // 尝试将 compiled.render 转换为函数，如果有异常，抛出 fnGenErrors
    res.render = createFunction(compiled.render, fnGenErrors)
    // 遍历 compiled.staticRenderFns，返回一个数组
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      // 将 compiled.staticRenderFns 中的每一项尝试转换为一个函数，如果有异常，抛出 fnGenErrors
      return createFunction(code, fnGenErrors)
    })

    // res = {
    //    render: Function,
    //    staticRenderFns: [Function * x]
    // }

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // 如果非生产环境，前面尝试转换为函数的步骤出了异常
      // 警告
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }
    // 返回 res
    return (cache[key] = res)
  }
}
