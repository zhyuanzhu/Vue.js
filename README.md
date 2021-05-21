# Vue.js 源码学习

## 入口文件说明

- 打包后的vue.js文件格式

    - umd：可以通过 `script` 标签直接引入使用，是一个立即执行函数

    - cjs: `common.js` 规范的js，`module.exports = Vue`
    
    - ejs: `es6` 模块规范，`export.default Vue`
    
- **Runtime Only 版本**
    
> 需要借助工具将 `.vue` 文件翻译成 `js`；如 `webpack` 的 `vue-loader` ，只包含运行时的代码，更轻量

- **Runtime Compiler 版本**

> 如果未对代码做预编译，但又使用 `Vue` 的 `template` 属性并传入一个字符串，则需要在客户端编译模版

**通过调试 `Runtime+compiler` 版本分析学习**



