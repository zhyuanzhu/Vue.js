/* @flow */

// 和平台相关的一些配置
import { baseOptions } from './options'

//
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
