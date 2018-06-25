# fcoin robot

## 如何使用

1. 安装nodejs (版本 > 5.6)
2. 安装依赖 npm install
3. 配置 config.js
4. 运行: node index.js

## 特点

* 完全开源!! 没有后门!!
* 灵活配置
* 支持多档交易, 即支持当前有多个未成交的记录

## 策略

只要记住了: 买单撤销是无所谓的, 但卖单撤销其实是亏的!

所以本程序的策略:

* 买单在1分钟内不成交, 立即撤销
* 不会撤销卖单
* 卖单价格 >= 买单价格
* 允许当前有多个未成交的记录, 避免卡死

## 技术支持
......