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

**通过调试 `Runtime+compiler` 完整版本分析学习**

## 问题

- `src/core/global-api/extend` 中的 `cachedCtors` 的意义所在。需要 `debug` 代码查看

- `Vue.prototype._init` 方法中的 `options._isComponent`, 其中这个 `_isComponent` 这个属性是什么时候挂载的？

- `_init` 方法 `initProxy` 中，查看 `vm.render._withStripped`, 其中这个 `_withStripped` 这个属性是什么时候挂载的？

### 响应式处理过程

_init() ---> initState() ---> initData() ---> observe(value) 
---> 创建 Observer 对象 ---> defineReactive ---> 依赖收集 ---> Watcher


### Phrasing

- 所有可放在 `p` 标签内，构成段落的元素均属于 **Phrasing** 元素

- 非 **Phrasing** 元素，放置到 p 标签内，页面解析会不按照元素嵌套结构  
```html
<p>
    a
    <div>b</div>
</p>  
== 浏览器解析之后的标签 ==>    
<p>a</p>
<div>b</div>
<p></p>
```



